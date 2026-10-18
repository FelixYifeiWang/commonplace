// Rebuild with: swift desktop/build-icons.swift
import AppKit
let root = "desktop/release"
let iconset = root + "/Commonplace.iconset"
try FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)
func render(_ size: Int) -> Data {
  let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
  let transform = NSAffineTransform()
  transform.scale(by: CGFloat(size) / 80)
  transform.translateX(by: 0, yBy: 80)
  transform.scaleX(by: 1, yBy: -1)
  transform.concat()
  NSColor.white.setFill()
  let face = NSBezierPath(ovalIn: NSRect(x: 9, y: 9, width: 62, height: 62))
  face.fill()
  NSColor.black.setStroke(); face.lineWidth = 1.8; face.stroke()
  func brow(_ x: CGFloat,_ y: CGFloat,_ a: CGFloat,_ b: CGFloat,_ c: CGFloat,_ d: CGFloat,_ e: CGFloat,_ f: CGFloat) {
    let p = NSBezierPath(); p.move(to: NSPoint(x:x,y:y)); p.curve(to:NSPoint(x:e,y:f),controlPoint1:NSPoint(x:a,y:b),controlPoint2:NSPoint(x:c,y:d)); p.lineWidth=3.3;p.lineCapStyle = .round;p.stroke()
  }
  brow(20,29,23,25,28,24,32,26);brow(47,25,51,22,57,23,60,27)
  NSColor.black.setFill()
  NSBezierPath(ovalIn:NSRect(x:24.7,y:33,width:4.6,height:6)).fill()
  NSBezierPath(ovalIn:NSRect(x:50.7,y:31,width:4.6,height:6)).fill()
  let nose=NSBezierPath();nose.move(to:NSPoint(x:39,y:30));nose.line(to:NSPoint(x:34,y:49));nose.line(to:NSPoint(x:45,y:49));nose.lineWidth=3.3;nose.lineCapStyle = .round;nose.lineJoinStyle = .round;nose.stroke()
  NSGraphicsContext.restoreGraphicsState()
  return bitmap.representation(using:.png,properties:[:])!
}
for size in [16,32,128,256,512] {
  try render(size).write(to:URL(fileURLWithPath:iconset+"/icon_\(size)x\(size).png"))
  try render(size*2).write(to:URL(fileURLWithPath:iconset+"/icon_\(size)x\(size)@2x.png"))
}
try render(1024).write(to:URL(fileURLWithPath:root+"/commonplace.png"))
let task=Process();task.executableURL=URL(fileURLWithPath:"/usr/bin/iconutil");task.arguments=["-c","icns",iconset,"-o",root+"/commonplace.icns"];try task.run();task.waitUntilExit();guard task.terminationStatus==0 else {fatalError("Icon build failed")}
try FileManager.default.removeItem(atPath:iconset)
