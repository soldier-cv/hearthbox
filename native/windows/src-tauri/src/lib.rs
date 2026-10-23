/// Windows 壳只负责开一个稳定的 WebView 原点，平台逻辑全在 `apps/shell`。
///
/// origin 固定为 `https://tauri.localhost`（窗口的 `useHttpsScheme`），
/// 与 docs/decisions.md D3 一致：改了 scheme 就等于换域名，IndexedDB 里的
/// 存档和已安装游戏会全部丢失。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("启动炉边 Windows 壳失败");
}
