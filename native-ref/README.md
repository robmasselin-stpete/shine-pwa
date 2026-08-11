# native-ref/ — tracked backups of gitignored native source

The whole `ios/` directory is gitignored (Rob regenerates it via Capacitor), but
`ios/App/App/AppDelegate.swift` carries **hand-written native Capacitor plugins**
that are NOT recoverable if `ios/` is ever regenerated:

- **`AppRating`** — native App Store review-prompt sheet.
- **`MQStore`** — native StoreKit 2 subscription (`mq_yearly`, $6.99/yr): product
  lookup, purchase, entitlement/access check, restore, and grandfathering via
  `AppTransaction.originalAppVersion`. This is what sells the subscription — losing
  it silently would break monetization.

`AppDelegate.swift` here is a **copy for version control / recovery only**. The
build uses the real file at `ios/App/App/AppDelegate.swift`. If you edit the native
plugins, update this copy too (`cp ios/App/App/AppDelegate.swift native-ref/`), and
if `ios/` is ever regenerated, paste these plugins back into the fresh AppDelegate.
