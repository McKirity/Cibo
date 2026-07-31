import { Shell } from "./shell/Shell";
import "./App.css";

/**
 * Failure policy lives in main.tsx: a pre-boot Evolu error mounts the fatal
 * launch screen (tier 4), a post-boot error is an error toast (tier 3).
 * Nothing here may gate the tree on `useEvoluError` — it never clears, so one
 * recovered worker rollback would permanently unmount the whole shell.
 */
function App() {
  return <Shell />;
}

export default App;
