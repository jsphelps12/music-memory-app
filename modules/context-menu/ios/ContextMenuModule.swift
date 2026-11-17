import ExpoModulesCore
import UIKit

// The moment context menu (1.4): long-press a moment and iOS lifts it, blurs
// what's behind, and attaches the menu, as in Photos and Messages. Wraps its
// React Native children in a UIContextMenuInteraction; a chosen action comes
// back as onAction { id } after the menu has closed. Taps still reach the
// children.
public class ContextMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ContextMenu")

    View(ContextMenuView.self) {
      Events("onAction")

      Prop("actions") { (view: ContextMenuView, actions: [ContextMenuAction]) in
        view.actions = actions
      }
      Prop("previewBackgroundColor") { (view: ContextMenuView, color: UIColor?) in
        view.previewBackground = color
      }
      Prop("previewRadius") { (view: ContextMenuView, radius: Double) in
        view.previewRadius = CGFloat(radius)
      }
      Prop("previewInset") { (view: ContextMenuView, inset: Double) in
        view.previewInset = CGFloat(inset)
      }
    }
  }
}

struct ContextMenuAction: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  /** An SF Symbol name. */
  @Field var systemImage: String? = nil
  @Field var destructive: Bool = false
}

class ContextMenuView: ExpoView, UIContextMenuInteractionDelegate {
  let onAction = EventDispatcher()
  var actions: [ContextMenuAction] = []
  var previewBackground: UIColor?
  var previewRadius: CGFloat = 12
  /** How far the lifted preview reaches past the view, so content isn't flush to its edge. */
  var previewInset: CGFloat = 0
  /** The action picked, until the menu is gone. */
  private var chosen: String?
  /** The menu has finished closing (in case an action is reported after that). */
  private var closed = true

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIContextMenuInteraction(delegate: self))
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    guard !actions.isEmpty else { return nil }
    closed = false
    chosen = nil
    let actions = self.actions
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      UIMenu(children: actions.map { action in
        UIAction(
          title: action.title,
          image: action.systemImage.flatMap { UIImage(systemName: $0) },
          attributes: action.destructive ? .destructive : []
        ) { _ in
          guard let self else { return }
          self.chosen = action.id
          if self.closed { self.flushChosen() }
        }
      })
    }
  }

  private func targetedPreview() -> UITargetedPreview {
    let parameters = UIPreviewParameters()
    let rect = bounds.insetBy(dx: -previewInset, dy: -previewInset)
    parameters.visiblePath = UIBezierPath(roundedRect: rect, cornerRadius: previewRadius)
    if let previewBackground { parameters.backgroundColor = previewBackground }
    return UITargetedPreview(view: self, parameters: parameters)
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configuration: UIContextMenuConfiguration,
    highlightPreviewForItemWithIdentifier identifier: any NSCopying
  ) -> UITargetedPreview? {
    targetedPreview()
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configuration: UIContextMenuConfiguration,
    dismissalPreviewForItemWithIdentifier identifier: any NSCopying
  ) -> UITargetedPreview? {
    targetedPreview()
  }

  // The chosen action is reported once the menu has finished closing, so
  // whatever it presents (a confirm sheet) isn't refused mid-dismissal.
  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    willEndFor configuration: UIContextMenuConfiguration,
    animator: (any UIContextMenuInteractionAnimating)?
  ) {
    let finish = { [weak self] in
      self?.closed = true
      self?.flushChosen()
    }
    guard let animator else { return finish() }
    animator.addCompletion(finish)
  }

  private func flushChosen() {
    guard let id = chosen else { return }
    chosen = nil
    onAction(["id": id])
  }
}
