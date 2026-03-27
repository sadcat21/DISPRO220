import { exec } from "child_process";
import chokidar from "chokidar";

console.log("🚀 Auto Commit Running for dispro22...");

chokidar
  .watch(".", {
    ignored: /node_modules|\.git/,
    persistent: true,
  })
  .on("change", (path) => {
    console.log(`📁 File changed: ${path}`);

    exec(
      `git add . && git commit -m "auto update 🚀 ${new Date().toLocaleString()}" && git push origin main`,
      (err, stdout, stderr) => {
        if (err) {
          console.log("❌ Error:", err.message);
          return;
        }
        console.log("✅ Auto committed & pushed!");
      }
    );
  });
