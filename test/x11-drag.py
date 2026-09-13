"""Real pointer drag inside the isolated Xvfb test display."""
import ctypes as c
import ctypes.util
import sys
import os
import time
x=c.CDLL(ctypes.util.find_library('X11'));t=c.CDLL(ctypes.util.find_library('Xtst'))
x.XOpenDisplay.argtypes=[c.c_char_p];x.XOpenDisplay.restype=c.c_void_p
d=x.XOpenDisplay(None);assert d
x.XFlush.argtypes=[c.c_void_p];x.XCloseDisplay.argtypes=[c.c_void_p]
t.XTestFakeMotionEvent.argtypes=[c.c_void_p,c.c_int,c.c_int,c.c_int,c.c_ulong]
t.XTestFakeButtonEvent.argtypes=[c.c_void_p,c.c_uint,c.c_int,c.c_ulong]
scale=float(os.environ.get('RIXU_TEST_SCALE','1'))
px,py,dx,dy=[round(int(v)*scale) for v in sys.argv[1:]]
t.XTestFakeMotionEvent(d,-1,px,py,0);x.XFlush(d);time.sleep(.1)
t.XTestFakeButtonEvent(d,1,1,0);x.XFlush(d);time.sleep(.15)
for i in range(1,11):
 t.XTestFakeMotionEvent(d,-1,px+round(dx*i/10),py+round(dy*i/10),0);x.XFlush(d);time.sleep(.04)
t.XTestFakeButtonEvent(d,1,0,0);x.XFlush(d);x.XCloseDisplay(d)
