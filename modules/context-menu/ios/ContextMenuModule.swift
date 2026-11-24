import ExpoModulesCore
import UIKit

// The moment menu, one native UIMenu wherever a moment offers actions.
//
// - ContextMenu (1.4, the default view): long-press a moment and iOS lifts
//   it, blurs what's behind, and attaches the menu, as in Photos and
//   Messages. Wraps its React Native children in a UIContextMenuInteraction.
//   Taps still reach the children.
// - MenuButtonView (1.4.1): tap and the same menu opens from the button, as
//   the "…" in Photos does. A UIButton with `menu` and
//   `showsMenuAsPrimaryAction`; its React Native children are drawn inside
//   it (see MenuButtonView for why).
//
// Both take the same `actions` and build the menu the same way
// (buildMomentMenu): destructive rows in their own inline section. A chosen
// action comes back as onAction { id } only after the menu has finished
// closing, so a sheet or confirm the action presents isn't dropped by iOS
// mid-dismiss. Neither builds a preview of a view that has left the window
// (a row unmounted while its menu is open): UITargetedPreview raises for
// one, which is an uncatchable crash.
public class ContextMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ContextMenu")

    // First, so it stays the module's default view (JS: requireNativeView("ContextMenu")).
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

    // JS: requireNativeView("ContextMenu", "MenuButtonView").
    View(MenuButtonView.self) {
      Events("onAction")

      Prop("actions") { (view: MenuButtonView, actions: [ContextMenuAction]) in
        view.actions = actions
      }
      Prop("label") { (view: MenuButtonView, label: String?) in
        view.label = label
      }
      Prop("hitOutset") { (view: MenuButtonView, outset: Double) in
        view.hitOutset = CGFloat(outset)
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

/// The menu for a list of actions: the others first, then the destructive
/// ones (Delete, Remove from album) in their own inline section so a
/// separator sets them apart. `choose` gets the picked action's id.
func buildMomentMenu(_ actions: [ContextMenuAction], choose: @escaping (String) -> Void) -> UIMenu {
  func item(_ action: ContextMenuAction) -> UIAction {
    UIAction(
      title: action.title,
      image: action.systemImage.flatMap { UIImage(systemName: $0) },
      attributes: action.destructive ? .destructive : []
    ) { _ in choose(action.id) }
  }
  let plain = actions.filter { !$0.destructive }.map(item)
  let destructive = actions.filter { $0.destructive }.map(item)
  guard !plain.isEmpty, !destructive.isEmpty else {
    return UIMenu(children: actions.map(item))
  }
  var children: [UIMenuElement] = plain
  children.append(UIMenu(title: "", options: .displayInline, children: destructive))
  return UIMenu(children: children)
}

/// Holds a picked action until the menu has finished closing, then reports it.
/// The action handler can run before or after the close animation ends; either
/// way the report comes once, after it.
final class ChosenAfterClose {
  private var chosen: String?
  private var closed = true
  var report: ((String) -> Void)?

  func menuWillOpen() {
    closed = false
    chosen = nil
  }

  func choose(_ id: String) {
    chosen = id
    if closed { flush() }
  }

  func menuWillEnd(_ animator: (any UIContextMenuInteractionAnimating)?) {
    let finish = { [weak self] in
      self?.closed = true
      self?.flush()
    }
    guard let animator else { return finish() }
    animator.addCompletion(finish)
  }

  private func flush() {
    guard let id = chosen else { return }
    chosen = nil
    report?(id)
  }
}

class ContextMenuView: ExpoView, UIContextMenuInteractionDelegate {
  let onAction = EventDispatcher()
  var actions: [ContextMenuAction] = []
  var previewBackground: UIColor?
  var previewRadius: CGFloat = 12
  /** How far the lifted preview reaches past the view, so content isn't flush to its edge. */
  var previewInset: CGFloat = 0
  private let pending = ChosenAfterClose()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    pending.report = { [weak self] id in self?.onAction(["id": id]) }
    addInteraction(UIContextMenuInteraction(delegate: self))
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    // Off-window (being unmounted): no menu, so no preview of it is asked for.
    guard !actions.isEmpty, window != nil else { return nil }
    pending.menuWillOpen()
    let actions = self.actions
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      buildMomentMenu(actions) { id in self?.pending.choose(id) }
    }
  }

  /// The lifted card, or nil once this view has left the window: a
  /// UITargetedPreview of an off-window view raises. Nil on dismissal makes
  /// the menu fade out instead of settling back onto the (gone) row.
  private func targetedPreview() -> UITargetedPreview? {
    guard window != nil else { return nil }
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
    pending.menuWillEnd(animator)
  }
}

/// Tap to open the moment menu (the "…" on the moment screen).
///
/// The React Native children are mounted *inside* the UIButton, not laid
/// over or under it: they draw the look (the glass "…" disc) and set the
/// size, while the button, filling this view, is the touch target, so the
/// glass look and its hit area stay exactly what the JS IconButton had.
/// The children take no touches (isUserInteractionEnabled off here, and
/// pointerEvents="none" from JS), so every tap lands on the button and
/// opens the menu; JS handlers inside never fire. They're hidden from
/// VoiceOver from JS too: the button is the one element, "More", with the
/// button trait.
class MenuButtonView: ExpoView {
  let onAction = EventDispatcher()
  var actions: [ContextMenuAction] = [] {
    didSet { button.menu = buildMomentMenu(actions) { [weak self] id in self?.button.pending.choose(id) } }
  }
  var label: String? {
    didSet { button.accessibilityLabel = label ?? "More" }
  }
  /** How far past its bounds the button takes touches (IconButton's glass hitSlop). */
  var hitOutset: CGFloat = 0 {
    didSet { button.hitOutset = hitOutset }
  }
  private let button = MenuButtonControl(type: .custom)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    button.showsMenuAsPrimaryAction = true
    // Rows in the order given, wherever the menu opens.
    button.preferredMenuElementOrder = .fixed
    button.isAccessibilityElement = true
    button.accessibilityTraits = .button
    button.accessibilityLabel = "More"
    button.pending.report = { [weak self] id in self?.onAction(["id": id]) }
    addSubview(button)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    button.frame = bounds
    // testID lands on this view; give it to the button too, the element
    // UI tests find and tap.
    button.accessibilityIdentifier = accessibilityIdentifier
  }

  override func mountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.isUserInteractionEnabled = false
    button.insertSubview(childComponentView, at: index)
  }

  override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {
    childComponentView.removeFromSuperview()
  }
}

/// The UIButton behind MenuButtonView. UIControl is its own menu
/// interaction's delegate; these overrides add the close-then-report timing
/// and the off-window guard on top of UIKit's own behavior (super).
final class MenuButtonControl: UIButton {
  let pending = ChosenAfterClose()
  var hitOutset: CGFloat = 0

  // The JS IconButton dimmed to 0.7 while pressed; so does this.
  override var isHighlighted: Bool {
    didSet { alpha = isHighlighted ? 0.7 : 1 }
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    bounds.insetBy(dx: -hitOutset, dy: -hitOutset).contains(point)
  }

  override func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    guard window != nil else { return nil }
    return super.contextMenuInteraction(interaction, configurationForMenuAtLocation: location)
  }

  // Off-window (the screen unmounted the button while its menu was open):
  // nil, so the menu fades out rather than UIKit building a preview of a
  // view with no window, which raises.
  override func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? {
    guard window != nil else { return nil }
    return super.contextMenuInteraction(interaction, previewForDismissingMenuWithConfiguration: configuration)
  }

  override func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    willDisplayMenuFor configuration: UIContextMenuConfiguration,
    animator: (any UIContextMenuInteractionAnimating)?
  ) {
    super.contextMenuInteraction(interaction, willDisplayMenuFor: configuration, animator: animator)
    pending.menuWillOpen()
  }

  override func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    willEndFor configuration: UIContextMenuConfiguration,
    animator: (any UIContextMenuInteractionAnimating)?
  ) {
    super.contextMenuInteraction(interaction, willEndFor: configuration, animator: animator)
    pending.menuWillEnd(animator)
  }
}
