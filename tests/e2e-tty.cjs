// The fixture supplies editor input; stdin remains /dev/null. Select TUI mode
// explicitly because Pi has no CLI switch for TUI with disconnected stdin.
Object.defineProperty(process.stdin, "isTTY", { value: true });
