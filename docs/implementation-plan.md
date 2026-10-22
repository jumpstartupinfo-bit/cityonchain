Reading the Nav component where the connect button lives to understand what to intercept: Good picture. The strategy: create a `MobileWalletConnect` component that detects mobile + no injected wallet, and shows a MetaMask deep link instead of calling ConnectKit's `show()`. Replace the wallet button in both the desktop nav and the More sheet with this smart component.You're in Plan mode — I can't write files here. Switch to **Build mode** using the mode selector, then I'll implement the full fix in one pass:

1. Create `MobileWalletConnect.tsx` — smart wallet button that detects mobile + no injected wallet and shows the MetaMask deep link instead of ConnectKit's "Get a Wallet" screen
2. Replace the `ConnectKitButton.Custom` in `Nav.tsx` (both the desktop pill and the More sheet row) with the new component
3. Lint/typecheck + push
