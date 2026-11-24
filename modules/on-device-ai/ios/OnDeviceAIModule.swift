import ExpoModulesCore
import ImageIO
import Photos
import UIKit
import Vision
#if canImport(FoundationModels)
import FoundationModels
#endif

// On-device photo understanding (1.4). Nothing here touches the network:
// images come from the copies already on the phone (iCloud-only originals
// are skipped, not downloaded), and every model is Apple's, running locally.
// JS decides what to do with the results (lib/photoInterest.ts).
public class OnDeviceAIModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OnDeviceAI")

    // For each Photos local identifier: scene labels (top few, with
    // confidence), how many faces, how much of the frame is text, and on
    // iOS 18+ Apple's aesthetics score and "utility" flag (documents,
    // receipts, whiteboards). Photos that can't be loaded are left out.
    AsyncFunction("analyzePhotos") { (ids: [String], maxSide: Int) async -> [[String: Any]] in
      let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
      guard status == .authorized || status == .limited, !ids.isEmpty else { return [] }
      let fetched = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
      var assets: [String: PHAsset] = [:]
      fetched.enumerateObjects { asset, _, _ in assets[asset.localIdentifier] = asset }

      var out: [[String: Any]] = []
      for id in ids {
        guard let asset = assets[id], let loaded = await OnDeviceAIModule.loadImage(asset, maxSide: maxSide) else {
          continue
        }
        out.append(await OnDeviceAIModule.analyze(id: id, image: loaded.image, orientation: loaded.orientation))
      }
      return out
    }

    // Whether Apple's on-device language model can be used here (iOS 26+,
    // Apple Intelligence on and ready).
    Function("canAsk") { () -> Bool in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        return SystemLanguageModel.default.availability == .available
      }
      #endif
      return false
    }

    // One short question that helps someone remember a song, from facts only
    // (song, when, where, what the photos show). It asks; it never answers or
    // speaks for them. JS checks the result and falls back to a template.
    AsyncFunction("askQuestion") { (facts: String) async -> String? in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        guard SystemLanguageModel.default.availability == .available else { return nil }
        let session = LanguageModelSession(instructions: OnDeviceAIModule.questionInstructions)
        do {
          let response = try await session.respond(to: facts, generating: MemoryQuestion.self)
          return response.content.question
        } catch {
          return nil
        }
      }
      #endif
      return nil
    }
  }

  static let questionInstructions = """
  You help someone remember a song from their past. Write one short question, under 12 words, \
  that invites them to recall that time. Use only the facts given. Never describe their feelings, \
  never invent people, places or events, never answer for them, and never write as them.
  """

  /// The best version already on the phone, at most `maxSide` px. No iCloud
  /// download. The CGImage holds the pixels as stored; `orientation` says how
  /// to turn them upright (a portrait photo is often stored sideways), which
  /// Vision needs to find faces and text.
  static func loadImage(_ asset: PHAsset, maxSide: Int) async -> (image: CGImage, orientation: CGImagePropertyOrientation)? {
    await withCheckedContinuation { continuation in
      let options = PHImageRequestOptions()
      options.isNetworkAccessAllowed = false
      options.deliveryMode = .highQualityFormat
      options.resizeMode = .fast
      options.isSynchronous = false
      let side = CGFloat(max(64, maxSide))
      PHImageManager.default().requestImage(
        for: asset,
        targetSize: CGSize(width: side, height: side),
        contentMode: .aspectFit,
        options: options
      ) { image, _ in
        guard let image = image, let cgImage = image.cgImage else {
          continuation.resume(returning: nil)
          return
        }
        continuation.resume(returning: (cgImage, OnDeviceAIModule.cgOrientation(image.imageOrientation)))
      }
    }
  }

  static func cgOrientation(_ orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch orientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }

  static func analyze(id: String, image: CGImage, orientation: CGImagePropertyOrientation) async -> [String: Any] {
    var result: [String: Any] = ["id": id]

    let classify = VNClassifyImageRequest()
    let faces = VNDetectFaceRectanglesRequest()
    let text = VNRecognizeTextRequest()
    text.recognitionLevel = .fast
    text.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    try? handler.perform([classify, faces, text])

    let labels = (classify.results ?? [])
      .filter { $0.confidence >= 0.25 }
      .sorted { $0.confidence > $1.confidence }
      .prefix(8)
      .map { [$0.identifier, Double($0.confidence)] as [Any] }
    result["labels"] = Array(labels)
    result["faces"] = faces.results?.count ?? 0

    var coverage = 0.0
    for observation in text.results ?? [] {
      coverage += Double(observation.boundingBox.width * observation.boundingBox.height)
    }
    result["textCoverage"] = min(1.0, coverage)

    if #available(iOS 18.0, *) {
      if let scores = try? await CalculateImageAestheticsScoresRequest().perform(on: image, orientation: orientation) {
        result["aesthetic"] = Double(scores.overallScore)
        result["utility"] = scores.isUtility
      }
    }
    return result
  }
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable
struct MemoryQuestion {
  @Guide(description: "One short question to the person, under 12 words, ending with a question mark")
  var question: String
}
#endif
