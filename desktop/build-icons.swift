// Rebuild with: swift desktop/build-icons.swift
// Static resting pose of lib/nox-neuron.ts. Compatibility filenames stay stable.
import AppKit
let root = "desktop/release"
let iconset = root + "/Nox.iconset"
try FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)
let corners = [NSPoint(x:24.14,y:17.25), NSPoint(x:27.25,y:62.28), NSPoint(x:43.76,y:44.18), NSPoint(x:64.84,y:36.28)]
let edges = [(0,1),(0,2),(0,3),(1,2),(1,3),(2,3)]
func render(_ size: Int, template: Bool = false) -> Data {
  let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
  let transform = NSAffineTransform()
  transform.scale(by: CGFloat(size) / 80)
  transform.translateX(by: 0, yBy: 80)
  transform.scaleX(by: 1, yBy: -1)
  transform.concat()
  if !template {
    let glass = NSBezierPath(ovalIn: NSRect(x:4,y:4,width:72,height:72))
    let gradient = NSGradient(colors: [NSColor.white, NSColor(calibratedRed:0.93,green:0.93,blue:0.97,alpha:1), NSColor.white])!
    gradient.draw(in:glass, angle:65)
    NSColor(calibratedWhite:0.77,alpha:0.6).setStroke(); glass.lineWidth=0.6; glass.stroke()
    NSColor.white.setStroke()
    let rim = NSBezierPath(ovalIn:NSRect(x:5.5,y:5.5,width:69,height:69));rim.lineWidth=1;rim.stroke()
  }
  let ink = template ? NSColor.black : NSColor(calibratedRed:0.231,green:0.212,blue:0.831,alpha:1)
  ink.setStroke()
  for (a,b) in edges {
    let A=corners[a], B=corners[b]
    let control=NSPoint(x:40+((A.x+B.x)/2-40)*0.45,y:40+((A.y+B.y)/2-40)*0.45)
    let p=NSBezierPath(); p.move(to:A)
    p.curve(to:B,controlPoint1:NSPoint(x:A.x+(control.x-A.x)*2/3,y:A.y+(control.y-A.y)*2/3),controlPoint2:NSPoint(x:B.x+(control.x-B.x)*2/3,y:B.y+(control.y-B.y)*2/3))
    p.lineWidth=template ? 4 : 1.15;p.lineCapStyle = .round;p.stroke()
  }
  ink.setFill()
  let radius:CGFloat = template ? 3.5 : 2
  for p in corners {NSBezierPath(ovalIn:NSRect(x:p.x-radius,y:p.y-radius,width:radius*2,height:radius*2)).fill()}
  NSBezierPath(ovalIn:NSRect(x:38,y:38,width:4,height:4)).fill()
  NSGraphicsContext.restoreGraphicsState()
  return bitmap.representation(using:.png,properties:[:])!
}
for size in [16,32,128,256,512] {
  try render(size).write(to:URL(fileURLWithPath:iconset+"/icon_\(size)x\(size).png"))
  try render(size*2).write(to:URL(fileURLWithPath:iconset+"/icon_\(size)x\(size)@2x.png"))
}
try render(1024).write(to:URL(fileURLWithPath:root+"/commonplace.png"))
try render(36,template:true).write(to:URL(fileURLWithPath:root+"/nox-tray.png"))
let task=Process();task.executableURL=URL(fileURLWithPath:"/usr/bin/iconutil");task.arguments=["-c","icns",iconset,"-o",root+"/commonplace.icns"];try task.run();task.waitUntilExit();guard task.terminationStatus==0 else {fatalError("Icon build failed")}
try FileManager.default.removeItem(atPath:iconset)
