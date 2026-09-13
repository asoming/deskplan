#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commctrl.h>
#include <node_api.h>
#include <cstring>

// Keep this app's window below ordinary application windows before the move is applied.
static LRESULT CALLBACK BottomLayer(HWND hwnd, UINT message, WPARAM wp, LPARAM lp, UINT_PTR id, DWORD_PTR) {
  if (message == WM_WINDOWPOSCHANGING && lp) {
    auto* position = reinterpret_cast<WINDOWPOS*>(lp);
    position->hwndInsertAfter = HWND_BOTTOM;
    position->flags &= ~SWP_NOZORDER;
  }
  if (message == WM_NCDESTROY) RemoveWindowSubclass(hwnd, BottomLayer, id);
  return DefSubclassProc(hwnd, message, wp, lp);
}
static bool OwnHandle(napi_env env, napi_value value, HWND* hwnd) {
  bool buffer = false; void* data = nullptr; size_t length = 0;
  if (napi_is_buffer(env, value, &buffer) != napi_ok || !buffer ||
      napi_get_buffer_info(env, value, &data, &length) != napi_ok || length != sizeof(HWND)) return false;
  std::memcpy(hwnd, data, sizeof(HWND));
  DWORD pid = 0; GetWindowThreadProcessId(*hwnd, &pid);
  return IsWindow(*hwnd) && pid == GetCurrentProcessId();
}
static napi_value Attach(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1]; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  HWND hwnd = nullptr;
  if (count != 1 || !OwnHandle(env, args[0], &hwnd)) { napi_throw_error(env, nullptr, "Expected this process's window handle"); return nullptr; }
  if (!SetWindowSubclass(hwnd, BottomLayer, 1, 0) || !SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)) {
    napi_throw_error(env, nullptr, "Could not attach desktop window layer"); return nullptr;
  }
  napi_value result; napi_get_boolean(env, true, &result); return result;
}
static napi_value IsBelow(napi_env env, napi_callback_info info) {
  size_t count = 2; napi_value args[2]; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  HWND panel = nullptr, other = nullptr;
  if (count != 2 || !OwnHandle(env, args[0], &panel) || !OwnHandle(env, args[1], &other)) {
    napi_throw_error(env, nullptr, "Expected this process's window handles"); return nullptr;
  }
  bool below = false;
  for (HWND w = GetWindow(panel, GW_HWNDPREV); w; w = GetWindow(w, GW_HWNDPREV)) if (w == other) { below = true; break; }
  napi_value result; napi_get_boolean(env, below, &result); return result;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {{"attach", nullptr, Attach, nullptr, nullptr, nullptr, napi_default, nullptr}, {"isBelow", nullptr, IsBelow, nullptr, nullptr, nullptr, napi_default, nullptr}};
  napi_define_properties(env, exports, 2, properties); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
