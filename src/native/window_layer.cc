#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commctrl.h>
#include <node_api.h>
#include <cstring>
#include <string>
#include <vector>
#include <cstdio>

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
// A hidden, independent console lets Windows PowerShell continue after Electron exits.
// DETACHED_PROCESS is deliberately not used: Windows PowerShell can exit without executing in that mode.
static bool Text(napi_env env, napi_value value, std::wstring* result) {
  size_t size = 0;
  if (napi_get_value_string_utf16(env, value, nullptr, 0, &size) != napi_ok || size > 24000) return false;
  std::vector<char16_t> text(size + 1);
  if (napi_get_value_string_utf16(env, value, text.data(), text.size(), &size) != napi_ok) return false;
  result->assign(text.begin(), text.begin() + size); return true;
}
static napi_value SpawnUpdater(napi_env env, napi_callback_info info) {
  std::fprintf(stderr, "Updater native: enter\n"); std::fflush(stderr);
  size_t count = 2; napi_value args[2]; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  std::wstring encoded, directory;
  if (count != 2 || !Text(env, args[0], &encoded) || !Text(env, args[1], &directory) || encoded.empty() ||
      encoded.find_first_not_of(L"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=") != std::wstring::npos) {
    napi_throw_error(env, nullptr, "Invalid updater launch arguments"); return nullptr;
  }
  std::fprintf(stderr, "Updater native: arguments read\n"); std::fflush(stderr);
  wchar_t system[MAX_PATH];
  if (!GetSystemDirectoryW(system, MAX_PATH)) { napi_throw_error(env, nullptr, "Windows system directory unavailable"); return nullptr; }
  const std::wstring executable = std::wstring(system) + L"\\WindowsPowerShell\\v1.0\\powershell.exe";
  const std::wstring command = L"\"" + executable + L"\" -NoProfile -NonInteractive -EncodedCommand " + encoded;
  std::vector<wchar_t> buffer(command.begin(), command.end()); buffer.push_back(0);
  std::fprintf(stderr, "Updater native: command built\n"); std::fflush(stderr);
  STARTUPINFOW startup{}; startup.cb = sizeof(startup); startup.dwFlags = STARTF_USESHOWWINDOW; startup.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION process{};
  if (!CreateProcessW(executable.c_str(), buffer.data(), nullptr, nullptr, FALSE, CREATE_NEW_CONSOLE | CREATE_NEW_PROCESS_GROUP,
      nullptr, directory.c_str(), &startup, &process)) {
    napi_throw_error(env, nullptr, "Could not start Windows update helper"); return nullptr;
  }
  std::fprintf(stderr, "Updater native: child started\n"); std::fflush(stderr);
  CloseHandle(process.hThread); CloseHandle(process.hProcess);
  napi_value result; napi_create_uint32(env, process.dwProcessId, &result); std::fprintf(stderr, "Updater native: returning\n"); std::fflush(stderr); return result;
}
static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {{"attach", nullptr, Attach, nullptr, nullptr, nullptr, napi_default, nullptr}, {"isBelow", nullptr, IsBelow, nullptr, nullptr, nullptr, napi_default, nullptr}};
  napi_define_properties(env, exports, 2, properties);
  napi_value launch; napi_create_function(env, "spawnUpdater", NAPI_AUTO_LENGTH, SpawnUpdater, nullptr, &launch); napi_set_named_property(env, exports, "spawnUpdater", launch); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
