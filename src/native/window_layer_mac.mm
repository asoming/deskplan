#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#include <node_api.h>
#include <cstring>

// Electron exposes an NSView pointer. Only accept content views owned by this app.
static NSWindow* OwnWindow(napi_env env, napi_value value) {
  bool buffer = false;
  void* data = nullptr;
  size_t length = 0;
  if (napi_is_buffer(env, value, &buffer) != napi_ok || !buffer ||
      napi_get_buffer_info(env, value, &data, &length) != napi_ok || length != sizeof(void*)) return nil;
  void* view = nullptr;
  std::memcpy(&view, data, sizeof(view));
  for (NSWindow* window in [NSApp windows]) {
    if ((__bridge void*)[window contentView] == view) return window;
  }
  return nil;
}
static napi_value Attach(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  NSWindow* window = count == 1 ? OwnWindow(env, args[0]) : nil;
  if (!window) { napi_throw_error(env, nullptr, "Expected this process's window handle"); return nullptr; }
  // Keep normal key-window behavior. The desktop window type cannot become key.
  [window setLevel:NSNormalWindowLevel - 1];
  napi_value result; napi_get_boolean(env, true, &result); return result;
}
static napi_value IsBelow(napi_env env, napi_callback_info info) {
  size_t count = 2; napi_value args[2];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  NSWindow* panel = count == 2 ? OwnWindow(env, args[0]) : nil;
  NSWindow* other = count == 2 ? OwnWindow(env, args[1]) : nil;
  if (!panel || !other) { napi_throw_error(env, nullptr, "Expected this process's window handles"); return nullptr; }
  bool below = [panel level] < [other level] &&
    [panel level] > CGWindowLevelForKey(kCGDesktopIconWindowLevelKey) && [panel canBecomeKeyWindow];
  napi_value result; napi_get_boolean(env, below, &result); return result;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"attach", nullptr, Attach, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"isBelow", nullptr, IsBelow, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 2, properties); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
