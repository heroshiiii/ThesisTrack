import app from "./app.js";
import { port } from "./config.js";

app.listen(port, () => {
  console.log(`ThesisTrack API listening on http://localhost:${port}`);
});