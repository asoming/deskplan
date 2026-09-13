"""Send a real Xdnd file transfer on an isolated X11 display, including hit testing."""
import ctypes as c
import ctypes.util
from pathlib import Path
import sys
import time

x = c.CDLL(ctypes.util.find_library('X11'))
t = c.CDLL(ctypes.util.find_library('Xtst'))
def api(lib, name, args, result=c.c_int):
    fn = getattr(lib, name); fn.argtypes = args; fn.restype = result; return fn
D, W, A = c.c_void_p, c.c_ulong, c.c_ulong
display = api(x, 'XOpenDisplay', [c.c_char_p], D)(None)
assert display
root = api(x, 'XDefaultRootWindow', [D], W)(display)
intern = api(x, 'XInternAtom', [D, c.c_char_p, c.c_int], A)
def atom(name): return intern(display, name.encode(), 0)
target, px, py = map(int, sys.argv[1:4])
payload = (Path(sys.argv[4]).resolve().as_uri() + '\r\n').encode()
api(t, 'XTestFakeMotionEvent', [D, c.c_int, c.c_int, c.c_int, W])(display, -1, px, py, 0)
sync = api(x, 'XSync', [D, c.c_int]); sync(display, 0)
query = api(x, 'XQueryPointer', [D, W, c.POINTER(W), c.POINTER(W), *([c.POINTER(c.c_int)] * 4), c.POINTER(c.c_uint)])
chain = []; current = root
while current:
    chain.append(current); rr, child = W(), W(); a, b, u, v = (c.c_int() for _ in range(4)); mask = c.c_uint()
    query(display, current, c.byref(rr), c.byref(child), c.byref(a), c.byref(b), c.byref(u), c.byref(v), c.byref(mask))
    current = child.value
assert target in chain, 'Pointer hits another window instead of the planner'

class Data(c.Union): _fields_ = [('b', c.c_char * 20), ('l', c.c_long * 5)]
header = [('type', c.c_int), ('serial', W), ('send_event', c.c_int), ('display', D)]
class Client(c.Structure): _fields_ = header + [('window', W), ('message_type', A), ('format', c.c_int), ('data', Data)]
class Request(c.Structure): _fields_ = header + [('owner', W), ('requestor', W), ('selection', A), ('target', A), ('property', A), ('time', W)]
class Selection(c.Structure): _fields_ = header + [('requestor', W), ('selection', A), ('target', A), ('property', A), ('time', W)]
class Event(c.Union): _fields_ = [('type', c.c_int), ('client', Client), ('request', Request), ('selection', Selection), ('pad', c.c_long * 24)]
send = api(x, 'XSendEvent', [D, W, c.c_int, c.c_long, c.POINTER(Event)])
source = api(x, 'XCreateSimpleWindow', [D, W, c.c_int, c.c_int, c.c_uint, c.c_uint, c.c_uint, W, W], W)(display, root, 0, 0, 1, 1, 0, 0, 0)
api(x, 'XSetSelectionOwner', [D, A, W, W])(display, atom('XdndSelection'), source, 0)
def message(name, values):
    event = Event(); event.client.type = 33; event.client.display = display
    event.client.window = target; event.client.message_type = atom(name); event.client.format = 32
    event.client.data.l[:] = values
    send(display, target, 0, 0, c.byref(event)); sync(display, 0)
message('XdndEnter', [source, 5 << 24, atom('text/uri-list'), 0, 0])
message('XdndPosition', [source, 0, (px << 16) | py, 0, atom('XdndActionCopy')])
pending = api(x, 'XPending', [D]); next_event = api(x, 'XNextEvent', [D, c.POINTER(Event)])
change = api(x, 'XChangeProperty', [D, W, A, A, c.c_int, c.c_int, c.c_char_p, c.c_int])
dropped = False; finished = False; deadline = time.monotonic() + 8
while time.monotonic() < deadline and not finished:
    if not pending(display): time.sleep(.01); continue
    event = Event(); next_event(display, c.byref(event))
    if event.type == 30:  # SelectionRequest: Chromium asks the drag source for file URIs.
        req = event.request; prop = req.property or req.target
        change(display, req.requestor, prop, req.target, 8, 0, payload, len(payload))
        reply = Event(); reply.selection = Selection(31, 0, 1, display, req.requestor, req.selection, req.target, prop, req.time)
        send(display, req.requestor, 0, 0, c.byref(reply)); sync(display, 0)
    elif event.type == 33 and event.client.message_type == atom('XdndStatus') and not dropped:
        if not event.client.data.l[1] & 1:
            time.sleep(.05)
            message('XdndPosition', [source, 0, (px << 16) | py, 0, atom('XdndActionCopy')])
            continue
        message('XdndDrop', [source, 0, 0, 0, 0]); dropped = True
    elif event.type == 33 and event.client.message_type == atom('XdndFinished'):
        assert event.client.data.l[1] & 1, 'Native drop was not accepted'
        finished = True
assert finished, 'Native drag did not complete'
api(x, 'XDestroyWindow', [D, W])(display, source)
api(x, 'XCloseDisplay', [D])(display)
print('Native file drop accepted above desktop surface')
