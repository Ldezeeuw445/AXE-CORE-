// AXE Camera — maakt één foto met de ingebouwde camera en stopt.
//
// De computer-worker roept dit aan voor `camera.snapshot`, via
//   open -W -n -g -a "AXE Camera.app" --args <pad.jpg>
// en níet rechtstreeks: zie Info.plist voor waarom (macOS vraagt anders nooit toestemming).
//
// Bouwen op de Mac zelf, vanuit infra/computer-worker/camera:
//   mkdir -p "AXE Camera.app/Contents/MacOS"
//   xcrun swiftc -O -o "AXE Camera.app/Contents/MacOS/axe-camera" main.swift
//   cp Info.plist "AXE Camera.app/Contents/Info.plist"
//   codesign --force -s - -i com.axe.camera "AXE Camera.app"
//
// `open` geeft de exitcode van de app niet door. Daarom schrijft de app bij een fout
// <pad.jpg>.fout met "<code> <uitleg>"; bij succes staat de foto op <pad.jpg>.
// Codes: 2 geen toestemming · 3 geen camera · 4 mislukt · 64 verkeerd gebruik.
// De eerste keer verschijnt de toestemmingsvraag op het scherm van deze Mac.
import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else {
  FileHandle.standardError.write("gebruik: axe-camera <pad.jpg>\n".data(using: .utf8)!)
  exit(64)
}
let uit = URL(fileURLWithPath: args[1])
let foutBestand = URL(fileURLWithPath: args[1] + ".fout")

func stop(_ code: Int32, _ msg: String) -> Never {
  try? "\(code) \(msg)\n".write(to: foutBestand, atomically: true, encoding: .utf8)
  FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
  exit(code)
}

/// Wacht zonder de hoofdthread te blokkeren. AVFoundation levert callbacks (toestemming,
/// "foto klaar") via de hoofd-runloop; een semafoor-wacht op de hoofdthread laat die nooit
/// door, en dan loopt elke foto in een time-out — gemeten op de iMac.
func wachtTot(_ seconden: TimeInterval, _ klaar: () -> Bool) -> Bool {
  let grens = Date().addingTimeInterval(seconden)
  while !klaar() && Date() < grens {
    RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
  }
  return klaar()
}

switch AVCaptureDevice.authorizationStatus(for: .video) {
case .authorized:
  break
case .notDetermined:
  var antwoord: Bool?
  AVCaptureDevice.requestAccess(for: .video) { ok in DispatchQueue.main.async { antwoord = ok } }
  _ = wachtTot(120) { antwoord != nil }
  if antwoord != true { stop(2, "geen cameratoestemming") }
default:
  stop(2, "geen cameratoestemming")
}

guard let device = AVCaptureDevice.default(for: .video) else { stop(3, "geen camera gevonden") }
let session = AVCaptureSession()
session.sessionPreset = .photo
guard let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else {
  stop(4, "camera niet te openen")
}
session.addInput(input)
let output = AVCapturePhotoOutput()
guard session.canAddOutput(output) else { stop(4, "geen foto-uitvoer") }
session.addOutput(output)

final class Vanger: NSObject, AVCapturePhotoCaptureDelegate {
  var klaar = false
  var fout: String?
  func photoOutput(_ o: AVCapturePhotoOutput, didFinishProcessingPhoto p: AVCapturePhoto, error: Error?) {
    if let error {
      fout = error.localizedDescription
    } else if let data = p.fileDataRepresentation() {
      do { try data.write(to: uit) } catch { fout = error.localizedDescription }
    } else {
      fout = "lege foto"
    }
    DispatchQueue.main.async { self.klaar = true }
  }
}

session.startRunning()
_ = wachtTot(1.5) { false }  // belichting en witbalans laten instellen, zonder de runloop te blokkeren
let vanger = Vanger()
output.capturePhoto(with: AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg]), delegate: vanger)
if !wachtTot(15, { vanger.klaar }) { stop(4, "time-out bij de foto") }
session.stopRunning()
if let f = vanger.fout { stop(4, f) }
print(uit.path)
