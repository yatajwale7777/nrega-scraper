// start.cjs
const { exec } = require("child_process");

// Pehle labour.cjs run karo
exec("node labour.cjs", (err, stdout, stderr) => {
  if (err) {
    console.error("Error in labour.cjs:", err);
    return;
  }
  console.log("labour.cjs finished:", stdout);

  // Jab labour.cjs khatam ho jaye tab runall.cjs chalao
  exec("node runall.cjs", (err2, stdout2, stderr2) => {
    if (err2) {
      console.error("Error in runall.cjs:", err2);
      return;
    }
    console.log("runall.cjs finished:", stdout2);
  });
});
