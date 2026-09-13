#include <node_api.h>
#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <unistd.h>
#include <uv.h>
#include <algorithm>
#include <cstdint>
#include <cstring>

// Watch only this app's window. Chromium replaces EWMH hints on hide/show;
// MapNotify and PropertyNotify let us restore BELOW without timers or focus changes.
struct Layer {
  uv_poll_t poll{};
  napi_env env;
  Display* display;
  Window window;
  Atom state, below;
  bool closing = false;
};
static void EnsureBelow(Layer* layer) {
  Display* display = layer->display; const Window window = layer->window;
  XWindowAttributes attributes;
  if (!XGetWindowAttributes(display, window, &attributes) || attributes.map_state == IsUnmapped) return;
  Atom type; int format; unsigned long size, remaining; unsigned char* data = nullptr;
  XGetWindowProperty(display, window, layer->state, 0, 128, False, XA_ATOM,
    &type, &format, &size, &remaining, &data);
  bool hasBelow = false;
  if (data && format == 32) {
    auto* atoms = reinterpret_cast<Atom*>(data);
    hasBelow = std::find(atoms, atoms + size, layer->below) != atoms + size;
  }
  if (data) XFree(data);
  if (hasBelow) return;
  XEvent event{};
  event.xclient.type = ClientMessage; event.xclient.window = window;
  event.xclient.message_type = layer->state; event.xclient.format = 32;
  event.xclient.data.l[0] = 1; event.xclient.data.l[1] = layer->below;
  event.xclient.data.l[3] = 1;
  XSendEvent(display, DefaultRootWindow(display), False,
    SubstructureRedirectMask | SubstructureNotifyMask, &event);
  XFlush(display);
}
static void Dispose(void* data) {
  auto* layer = static_cast<Layer*>(data);
  if (layer->closing) return;
  layer->closing = true;
  uv_poll_stop(&layer->poll);
  uv_close(reinterpret_cast<uv_handle_t*>(&layer->poll), [](uv_handle_t* handle) {
    auto* layer = static_cast<Layer*>(handle->data);
    XCloseDisplay(layer->display); delete layer;
  });
}
static void Events(uv_poll_t* handle, int status, int) {
  auto* layer = static_cast<Layer*>(handle->data);
  if (status < 0) return;
  bool check = false;
  while (XPending(layer->display)) {
    XEvent event; XNextEvent(layer->display, &event);
    if (event.type == DestroyNotify) {
      napi_remove_env_cleanup_hook(layer->env, Dispose, layer); Dispose(layer); return;
    }
    if (event.type == MapNotify ||
        (event.type == PropertyNotify && event.xproperty.atom == layer->state)) check = true;
  }
  if (check) EnsureBelow(layer);
}
static napi_value Attach(napi_env env, napi_callback_info info) {
  size_t count = 1, length = 0;
  napi_value args[1]; void* bytes = nullptr; bool buffer = false;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 1 || napi_is_buffer(env, args[0], &buffer) != napi_ok || !buffer ||
      napi_get_buffer_info(env, args[0], &bytes, &length) != napi_ok || length != sizeof(uint32_t)) {
    napi_throw_error(env, nullptr, "Expected an X11 window handle"); return nullptr;
  }
  uint32_t id; std::memcpy(&id, bytes, sizeof(id));
  Display* display = XOpenDisplay(nullptr);
  if (!display) { napi_throw_error(env, nullptr, "Desktop layer requires X11 or XWayland"); return nullptr; }
  const Window window = id;
  Atom type; int format; unsigned long size, remaining; unsigned char* data = nullptr;
  XGetWindowProperty(display, window, XInternAtom(display, "_NET_WM_PID", False),
    0, 1, False, XA_CARDINAL, &type, &format, &size, &remaining, &data);
  const bool own = data && format == 32 && size == 1 &&
    *reinterpret_cast<unsigned long*>(data) == static_cast<unsigned long>(getpid());
  if (data) XFree(data);
  if (!own) { XCloseDisplay(display); napi_throw_error(env, nullptr, "Expected this process's window"); return nullptr; }

  auto* layer = new Layer;
  layer->env = env; layer->display = display; layer->window = window;
  layer->state = XInternAtom(display, "_NET_WM_STATE", False);
  layer->below = XInternAtom(display, "_NET_WM_STATE_BELOW", False);
  XSelectInput(display, window, StructureNotifyMask | PropertyChangeMask);
  XFlush(display);
  uv_loop_t* loop; napi_get_uv_event_loop(env, &loop);
  if (uv_poll_init(loop, &layer->poll, ConnectionNumber(display)) != 0) {
    XCloseDisplay(display); delete layer;
    napi_throw_error(env, nullptr, "Could not observe planner window state"); return nullptr;
  }
  layer->poll.data = layer;
  napi_add_env_cleanup_hook(env, Dispose, layer);
  uv_poll_start(&layer->poll, UV_READABLE, Events);
  uv_unref(reinterpret_cast<uv_handle_t*>(&layer->poll));
  EnsureBelow(layer);
  napi_value result; napi_get_boolean(env, true, &result); return result;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor property = {"attach", nullptr, Attach, nullptr, nullptr, nullptr, napi_default, nullptr};
  napi_define_properties(env, exports, 1, &property); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
