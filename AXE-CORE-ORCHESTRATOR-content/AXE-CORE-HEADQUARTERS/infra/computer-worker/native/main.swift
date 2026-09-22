import AppKit
import ApplicationServices
import CoreGraphics
import Foundation
import ScreenCaptureKit

struct ToolError: Error {
    let message: String
}

func writeJSON(_ value: Any, to path: String) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: URL(fileURLWithPath: path), options: .atomic)
}

func argJSON(_ raw: String?) -> [String: Any] {
    guard let raw, let data = raw.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return [:]
    }
    return obj
}

func activeDisplays() -> [CGDirectDisplayID] {
    var count: UInt32 = 0
    CGGetActiveDisplayList(0, nil, &count)
    var ids = Array(repeating: CGDirectDisplayID(), count: Int(count))
    CGGetActiveDisplayList(count, &ids, &count)
    return Array(ids.prefix(Int(count))).sorted { a, b in
        let aMain = CGDisplayIsMain(a) != 0
        let bMain = CGDisplayIsMain(b) != 0
        if aMain != bMain { return aMain }
        let af = CGDisplayBounds(a)
        let bf = CGDisplayBounds(b)
        if af.origin.x != bf.origin.x { return af.origin.x < bf.origin.x }
        return af.origin.y < bf.origin.y
    }
}

func displaysPayload() -> [[String: Any]] {
    activeDisplays().enumerated().map { index, id in
        let b = CGDisplayBounds(id)
        let logicalW = Double(b.width)
        let pixelW = Double(CGDisplayPixelsWide(id))
        return [
            "index": index,
            "id": UInt64(id),
            "main": CGDisplayIsMain(id) != 0,
            "x": Double(b.origin.x),
            "y": Double(b.origin.y),
            "width": logicalW,
            "height": Double(b.height),
            "pixel_width": Int(CGDisplayPixelsWide(id)),
            "pixel_height": Int(CGDisplayPixelsHigh(id)),
            "scale": logicalW > 0 ? pixelW / logicalW : 1.0,
        ]
    }
}

func requireAccessibility() throws {
    guard AXIsProcessTrusted() else {
        throw ToolError(message: "Accessibility permission is not granted for AXE Computer Use.")
    }
}

func requestAccessibility() -> Bool {
    let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    return AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
}

func mouseEvent(_ type: CGEventType, point: CGPoint, button: CGMouseButton = .left) throws {
    try requireAccessibility()
    guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button) else {
        throw ToolError(message: "Could not create mouse event.")
    }
    event.post(tap: .cghidEventTap)
}

func imagePointToGlobal(displayIndex: Int, imageX: Double, imageY: Double) throws -> CGPoint {
    let ids = activeDisplays()
    guard ids.indices.contains(displayIndex) else {
        throw ToolError(message: "No display at index \(displayIndex).")
    }
    let id = ids[displayIndex]
    let bounds = CGDisplayBounds(id)
    let pixelW = Double(CGDisplayPixelsWide(id))
    let pixelH = Double(CGDisplayPixelsHigh(id))
    guard pixelW > 0, pixelH > 0 else {
        throw ToolError(message: "Display pixel geometry is unavailable.")
    }
    // CGDisplayCreateImage produces physical pixels while CGEvent consumes the
    // global Quartz coordinate space in logical points. Keep this conversion in
    // exactly one place so Retina and multi-monitor origins cannot drift.
    return CGPoint(
        x: bounds.origin.x + CGFloat(imageX / pixelW) * bounds.width,
        y: bounds.origin.y + CGFloat(imageY / pixelH) * bounds.height
    )
}

func point(_ args: [String: Any], prefix: String = "") throws -> CGPoint {
    if let x = args["\(prefix)x"] as? NSNumber, let y = args["\(prefix)y"] as? NSNumber {
        return CGPoint(x: x.doubleValue, y: y.doubleValue)
    }

    let imageXKey = "\(prefix)image_x"
    let imageYKey = "\(prefix)image_y"
    if let x = args[imageXKey] as? NSNumber, let y = args[imageYKey] as? NSNumber {
        let displayIndex = (args["display_index"] as? NSNumber)?.intValue ?? 0
        return try imagePointToGlobal(displayIndex: displayIndex, imageX: x.doubleValue, imageY: y.doubleValue)
    }

    throw ToolError(message: "\(prefix)x/\(prefix)y or \(prefix)image_x/\(prefix)image_y are required.")
}

func keyCode(_ name: String) -> CGKeyCode? {
    switch name.lowercased() {
    case "return", "enter": return 36
    case "tab": return 48
    case "space": return 49
    case "delete", "backspace": return 51
    case "escape", "esc": return 53
    case "command", "cmd": return 55
    case "shift": return 56
    case "capslock": return 57
    case "option", "alt": return 58
    case "control", "ctrl": return 59
    case "rightshift": return 60
    case "rightoption": return 61
    case "rightcontrol": return 62
    case "left": return 123
    case "right": return 124
    case "down": return 125
    case "up": return 126
    case "home": return 115
    case "end": return 119
    case "pageup": return 116
    case "pagedown": return 121
    case "f1": return 122
    case "f2": return 120
    case "f3": return 99
    case "f4": return 118
    case "f5": return 96
    case "f6": return 97
    case "f7": return 98
    case "f8": return 100
    case "f9": return 101
    case "f10": return 109
    case "f11": return 103
    case "f12": return 111
    default: return nil
    }
}

func flags(_ mods: [String]) -> CGEventFlags {
    var f: CGEventFlags = []
    for m in mods.map({ $0.lowercased() }) {
        switch m {
        case "command", "cmd": f.insert(.maskCommand)
        case "shift": f.insert(.maskShift)
        case "option", "alt": f.insert(.maskAlternate)
        case "control", "ctrl": f.insert(.maskControl)
        case "fn", "function": f.insert(.maskSecondaryFn)
        default: break
        }
    }
    return f
}

func postKey(code: CGKeyCode, modifiers: CGEventFlags) throws {
    try requireAccessibility()
    guard let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true),
          let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false) else {
        throw ToolError(message: "Could not create keyboard event.")
    }
    down.flags = modifiers
    up.flags = modifiers
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
}

func typeText(_ text: String) throws {
    try requireAccessibility()
    guard !text.isEmpty else { return }
    let utf16 = Array(text.utf16)
    let chunk = 40
    var offset = 0
    while offset < utf16.count {
        let end = min(offset + chunk, utf16.count)
        var slice = Array(utf16[offset..<end])
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else {
            throw ToolError(message: "Could not create keyboard event.")
        }
        slice.withUnsafeMutableBufferPointer { ptr in
            down.keyboardSetUnicodeString(stringLength: ptr.count, unicodeString: ptr.baseAddress!)
            up.keyboardSetUnicodeString(stringLength: ptr.count, unicodeString: ptr.baseAddress!)
        }
        down.post(tap: .cghidEventTap)
        up.post(tap: .cghidEventTap)
        offset = end
        Thread.sleep(forTimeInterval: 0.012)
    }
}

func runningApps() -> [[String: Any]] {
    NSWorkspace.shared.runningApplications
        .filter { $0.activationPolicy == .regular }
        .map { app in
            [
                "name": app.localizedName ?? "",
                "bundle_id": app.bundleIdentifier ?? "",
                "pid": Int(app.processIdentifier),
                "active": app.isActive,
                "hidden": app.isHidden,
            ] as [String: Any]
        }
}

func windowsPayload() -> [[String: Any]] {
    guard let raw = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
        return []
    }
    return raw.compactMap { row in
        guard let layer = row[kCGWindowLayer as String] as? NSNumber, layer.intValue == 0 else { return nil }
        let owner = row[kCGWindowOwnerName as String] as? String ?? ""
        let name = row[kCGWindowName as String] as? String ?? ""
        let number = row[kCGWindowNumber as String] as? NSNumber
        var bounds = CGRect.zero
        if let bd = row[kCGWindowBounds as String] as? [String: Any],
           let x = (bd["X"] as? NSNumber)?.doubleValue,
           let y = (bd["Y"] as? NSNumber)?.doubleValue,
           let w = (bd["Width"] as? NSNumber)?.doubleValue,
           let h = (bd["Height"] as? NSNumber)?.doubleValue {
            bounds = CGRect(x: x, y: y, width: w, height: h)
        }
        return [
            "window_id": number?.intValue ?? 0,
            "app": owner,
            "title": name,
            "x": Double(bounds.origin.x),
            "y": Double(bounds.origin.y),
            "width": Double(bounds.width),
            "height": Double(bounds.height),
        ]
    }
}

@available(macOS 14.0, *)
func captureDisplay(index: Int, path: String) async throws -> [String: Any] {
    guard CGPreflightScreenCaptureAccess() else {
        throw ToolError(message: "Screen Recording permission is not granted for AXE Computer Use.")
    }

    let ids = activeDisplays()
    guard ids.indices.contains(index) else {
        throw ToolError(message: "No display at index \(index).")
    }
    let id = ids[index]

    // CGDisplayCreateImage is unavailable in the current macOS SDK. Modern
    // capture goes through ScreenCaptureKit, keyed by the same CGDirectDisplayID
    // used by the rest of AXE's display/coordinate model.
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    guard let display = content.displays.first(where: { $0.displayID == id }) else {
        throw ToolError(message: "Selected display is not available to ScreenCaptureKit.")
    }

    let filter = SCContentFilter(display: display, excludingWindows: [])
    let config = SCStreamConfiguration()
    config.width = Int(CGDisplayPixelsWide(id))
    config.height = Int(CGDisplayPixelsHigh(id))
    config.showsCursor = true

    let image = try await SCScreenshotManager.captureImage(
        contentFilter: filter,
        configuration: config
    )

    let rep = NSBitmapImageRep(cgImage: image)
    guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.78]) else {
        throw ToolError(message: "Could not encode the display image.")
    }
    try data.write(to: URL(fileURLWithPath: path), options: .atomic)

    let bounds = CGDisplayBounds(id)
    return [
        "path": path,
        "display_index": index,
        "width": image.width,
        "height": image.height,
        "logical_x": Double(bounds.origin.x),
        "logical_y": Double(bounds.origin.y),
        "logical_width": Double(bounds.width),
        "logical_height": Double(bounds.height),
        "pixel_width": Int(CGDisplayPixelsWide(id)),
        "pixel_height": Int(CGDisplayPixelsHigh(id)),
        "bytes": data.count,
        "mime": "image/jpeg",
    ]
}

func execute(_ command: String, _ args: [String: Any]) async throws -> Any {
    switch command {
    case "permissions.status":
        return [
            "screen_recording": CGPreflightScreenCaptureAccess(),
            "accessibility": AXIsProcessTrusted(),
        ]
    case "permissions.request_screen":
        return ["screen_recording": CGRequestScreenCaptureAccess()]
    case "permissions.request_accessibility":
        return ["accessibility": requestAccessibility()]
    case "screen.displays":
        return displaysPayload()
    case "screen.capture":
        let index = (args["display_index"] as? NSNumber)?.intValue ?? 0
        guard let path = args["path"] as? String, !path.isEmpty else {
            throw ToolError(message: "path is required.")
        }
        guard #available(macOS 14.0, *) else {
            throw ToolError(message: "AXE Computer Use screen capture requires macOS 14 or newer.")
        }
        return try await captureDisplay(index: index, path: path)
    case "pointer.position":
        let p = CGEvent(source: nil)?.location ?? .zero
        return ["x": Double(p.x), "y": Double(p.y)]
    case "pointer.move":
        let p = try point(args)
        try mouseEvent(.mouseMoved, point: p)
        return ["x": Double(p.x), "y": Double(p.y)]
    case "pointer.click", "pointer.double_click", "pointer.right_click":
        let p = try point(args)
        let button: CGMouseButton = command == "pointer.right_click" ? .right : .left
        let down: CGEventType = button == .right ? .rightMouseDown : .leftMouseDown
        let up: CGEventType = button == .right ? .rightMouseUp : .leftMouseUp
        let clicks = command == "pointer.double_click" ? 2 : 1
        for n in 1...clicks {
            try requireAccessibility()
            guard let evDown = CGEvent(mouseEventSource: nil, mouseType: down, mouseCursorPosition: p, mouseButton: button),
                  let evUp = CGEvent(mouseEventSource: nil, mouseType: up, mouseCursorPosition: p, mouseButton: button) else {
                throw ToolError(message: "Could not create click event.")
            }
            if clicks == 2 {
                evDown.setIntegerValueField(.mouseEventClickState, value: Int64(n))
                evUp.setIntegerValueField(.mouseEventClickState, value: Int64(n))
            }
            evDown.post(tap: .cghidEventTap)
            evUp.post(tap: .cghidEventTap)
            Thread.sleep(forTimeInterval: 0.08)
        }
        return ["x": Double(p.x), "y": Double(p.y), "clicks": clicks, "button": button == .right ? "right" : "left"]
    case "pointer.drag":
        try requireAccessibility()
        let a = try point(args, prefix: "from_")
        let b = try point(args, prefix: "to_")
        try mouseEvent(.mouseMoved, point: a)
        try mouseEvent(.leftMouseDown, point: a)
        for i in 1...12 {
            let t = Double(i) / 12.0
            let p = CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
            try mouseEvent(.leftMouseDragged, point: p)
            Thread.sleep(forTimeInterval: 0.012)
        }
        try mouseEvent(.leftMouseUp, point: b)
        return ["from_x": Double(a.x), "from_y": Double(a.y), "to_x": Double(b.x), "to_y": Double(b.y)]
    case "pointer.scroll":
        try requireAccessibility()
        let dy = (args["dy"] as? NSNumber)?.int32Value ?? 0
        let dx = (args["dx"] as? NSNumber)?.int32Value ?? 0
        guard let ev = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0) else {
            throw ToolError(message: "Could not create scroll event.")
        }
        ev.post(tap: .cghidEventTap)
        return ["dx": dx, "dy": dy]
    case "keyboard.type":
        guard let text = args["text"] as? String else { throw ToolError(message: "text is required.") }
        try typeText(text)
        return ["characters": text.count]
    case "keyboard.key":
        guard let name = args["key"] as? String, let code = keyCode(name) else {
            throw ToolError(message: "Unsupported or missing key.")
        }
        let mods = args["modifiers"] as? [String] ?? []
        try postKey(code: code, modifiers: flags(mods))
        return ["key": name, "modifiers": mods]
    case "app.list":
        return runningApps()
    case "app.frontmost":
        guard let app = NSWorkspace.shared.frontmostApplication else { return [:] }
        return ["name": app.localizedName ?? "", "bundle_id": app.bundleIdentifier ?? "", "pid": Int(app.processIdentifier)]
    case "app.open":
        guard let name = args["app"] as? String, !name.isEmpty else { throw ToolError(message: "app is required.") }
        guard NSWorkspace.shared.launchApplication(name) else { throw ToolError(message: "Could not open \(name).") }
        return ["app": name]
    case "app.focus":
        guard let name = args["app"] as? String, !name.isEmpty else { throw ToolError(message: "app is required.") }
        guard let app = NSWorkspace.shared.runningApplications.first(where: {
            ($0.localizedName ?? "").caseInsensitiveCompare(name) == .orderedSame ||
            ($0.bundleIdentifier ?? "").caseInsensitiveCompare(name) == .orderedSame
        }) else { throw ToolError(message: "\(name) is not running.") }
        guard app.activate(options: [.activateIgnoringOtherApps]) else { throw ToolError(message: "Could not focus \(name).") }
        return ["app": app.localizedName ?? name, "bundle_id": app.bundleIdentifier ?? ""]
    case "window.list":
        return windowsPayload()
    default:
        throw ToolError(message: "Unknown native computer-use command: \(command)")
    }
}

@main
struct AXEComputerUseMain {
    static func main() async {
        let args = CommandLine.arguments
        guard args.count >= 3 else {
            exit(64)
        }

        let command = args[1]
        let output = args[2]
        let payload = argJSON(args.count >= 4 ? args[3] : nil)

        do {
            let result = try await execute(command, payload)
            try writeJSON(["ok": true, "command": command, "result": result], to: output)
            exit(0)
        } catch let e as ToolError {
            try? writeJSON(["ok": false, "command": command, "error": e.message], to: output)
            exit(2)
        } catch {
            try? writeJSON(["ok": false, "command": command, "error": error.localizedDescription], to: output)
            exit(1)
        }
    }
}
