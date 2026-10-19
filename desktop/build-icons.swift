// Rebuild with: node scripts/build-newron-mark.mjs && swift desktop/build-icons.swift
// Draws Newron's mark, Nox's resting N, from the outline in public/nox.svg (traced by lib/newron-mark.mjs).
// Compatibility filenames stay stable.
import AppKit
let root = "desktop/release"
let iconset = root + "/Nox.iconset"
try FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)

// The outline is written with only M, C and Z commands in an 80-unit box, y down.
let svg = try String(contentsOfFile: "public/nox.svg", encoding: .utf8)
guard let start = svg.range(of: " d=\""), let end = svg[start.upperBound...].firstIndex(of: "\"") else {
  fatalError("public/nox.svg has no outline; run node scripts/build-newron-mark.mjs first")
}
let tokens = svg[start.upperBound..<end].split(separator: " ").map(String.init)
func outline() -> NSBezierPath {
  let path = NSBezierPath()
  var i = 0
  func number() -> CGFloat { i += 1; return CGFloat(Double(tokens[i - 1])!) }
  while i < tokens.count {
    let command = tokens[i]; i += 1
    switch command {
    case "M": path.move(to: NSPoint(x: number(), y: number()))
    case "C":
      let c1 = NSPoint(x: number(), y: number()), c2 = NSPoint(x: number(), y: number()), p = NSPoint(x: number(), y: number())
      path.curve(to: p, controlPoint1: c1, controlPoint2: c2)
    case "Z": path.close()
    default: fatalError("Unexpected outline command \(command)")
    }
  }
  return path
}

func render(_ size: Int, template: Bool = false) -> Data {
  let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
  let transform = NSAffineTransform()
  transform.scale(by: CGFloat(size) / 80)
  transform.translateX(by: 0, yBy: 80)
  transform.scaleX(by: 1, yBy: -1)
  transform.concat()
  if template {
    // The menu-bar icon is the mark alone, filling the template.
    let fill = NSAffineTransform()
    fill.translateX(by: 40, yBy: 40); fill.scale(by: 1.85); fill.translateX(by: -40, yBy: -40)
    fill.concat()
  } else {
    let glass = NSBezierPath(ovalIn: NSRect(x:4,y:4,width:72,height:72))
    let gradient = NSGradient(colors: [NSColor.white, NSColor(calibratedRed:0.93,green:0.93,blue:0.97,alpha:1), NSColor.white])!
    gradient.draw(in:glass, angle:65)
    NSColor(calibratedWhite:0.77,alpha:0.6).setStroke(); glass.lineWidth=0.6; glass.stroke()
    NSColor.white.setStroke()
    let rim = NSBezierPath(ovalIn:NSRect(x:5.5,y:5.5,width:69,height:69));rim.lineWidth=1;rim.stroke()
  }
  (template ? NSColor.black : NSColor(calibratedRed:0.231,green:0.212,blue:0.831,alpha:1)).setFill()
  outline().fill()
  NSGraphicsContext.restoreGraphicsState()
  return bitmap.representation(using:.png,properties:[:])!
}
for size in [16,32,128,256,512] {
  try render(size).write(to:URL(fileURLWithPath:iconset+"/icon_\(size)x\(size).png"))
  try render(size*2).write(to:URL(fileURLWithPath:iconset+"/icon_\(size)x\(size)@2x.png"))
}
try render(1024).write(to:URL(fileURLWithPath:root+"/commonplace.png"))
try render(36,template:true).write(to:URL(fileURLWithPath:root+"/nox-tray.png"))
try render(180).write(to:URL(fileURLWithPath:"public/nox-icon.png"))
let task=Process();task.executableURL=URL(fileURLWithPath:"/usr/bin/iconutil");task.arguments=["-c","icns",iconset,"-o",root+"/commonplace.icns"];try task.run();task.waitUntilExit();guard task.terminationStatus==0 else {fatalError("Icon build failed")}
try FileManager.default.removeItem(atPath:iconset)
