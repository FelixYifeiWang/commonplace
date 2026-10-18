import AppKit
import CoreGraphics

func emit(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value), let text = String(data: data, encoding: .utf8) { print(text) }
}
let args = CommandLine.arguments
guard args.count == 4, let x = Double(args[1]), let y = Double(args[2]),
      let companionPID = Int32(args[3]), companionPID > 0 else { emit(["error": "coordinates"]); exit(0) }
let point = CGPoint(x: x, y: y)
// Window geometry and owning process only. No Accessibility API, screenshots, window titles, or permission prompts.
let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let windows = info.filter { window in
    // Ignore only this companion's windows, without hiding them to see beneath.
    guard let ownerPID = window[kCGWindowOwnerPID as String] as? Int32,
          ownerPID != companionPID,
          (window[kCGWindowLayer as String] as? Int) == 0,
          let raw = window[kCGWindowBounds as String] as? NSDictionary,
          let rect = CGRect(dictionaryRepresentation: raw) else { return false }
    return rect.width >= 150 && rect.height >= 100
}
for window in windows {
    guard let raw = window[kCGWindowBounds as String] as? NSDictionary,
          let rect = CGRect(dictionaryRepresentation: raw), rect.contains(point),
          let pid = window[kCGWindowOwnerPID as String] as? Int32 else { continue }
    let app = NSRunningApplication(processIdentifier: pid)
    let count = windows.filter { ($0[kCGWindowOwnerPID as String] as? Int32) == pid }.count
    emit([
        "bundleId": app?.bundleIdentifier ?? "", "pid": pid,
        "launchedAt": (app?.launchDate?.timeIntervalSince1970 ?? 0) * 1000,
        "windowCount": count,
        "point": ["x": x, "y": y],
        "bounds": ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height]
    ])
    exit(0)
}
emit(["error": "no-target", "message": "Move the buddy over an open Codex conversation or Claude Code session."])
