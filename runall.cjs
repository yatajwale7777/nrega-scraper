const { exec } = require("child_process");
const auth = require("./creds"); // JWT auth client from creds.js

// List of scripts to run sequentially
const filesToRun = [
  "trakingfile.cjs",
  "A1.cjs",
  "labour.cjs",
  "master.cjs",
  "link.cjs",
  "achiv.cjs",
  "works.cjs",
];

// Delay utility
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run one script
function runScript(file) {
  return new Promise((resolve, reject) => {
    console.log(`\n▶ Running: ${file}`);
    const process = exec(`node ${file}`, { stdio: "inherit" });

    process.stdout?.on("data", data => process.stdout.write(data));
    process.stderr?.on("data", data => process.stderr.write(data));

    process.on("exit", code => {
      if (code === 0) {
        console.log(`✅ Finished: ${file}`);
        resolve();
      } else {
        console.error(`❌ Failed: ${file}`);
        reject(new Error(`${file} failed with code ${code}`));
      }
    });
  });
}

// Run all scripts sequentially with delay
async function runAll() {
  for (const file of filesToRun) {
    try {
      await runScript(file);
      await wait(3000); // ⏱ Add 3-second delay between scripts
    } catch (err) {
      console.error(`⚠️ Error running ${file}:`, err.message);
    }
  }

  console.log("\n🎉 All scripts finished!");
}

// Start
runAll();
