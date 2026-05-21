/** @param {import("app-builder-lib").AfterPackContext} context */
exports.default = async function afterPackAdhocSign(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  if (
    process.env.CSC_LINK?.trim() ||
    process.env.CSC_NAME?.trim() ||
    process.env.CSC_IDENTITY?.trim()
  ) {
    return;
  }

  const { execFileSync } = require("node:child_process");
  const { join } = require("node:path");

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = join(context.appOutDir, appName);
  const entitlements = join(context.packager.projectDir, "resources/entitlements.mac.plist");

  console.log(`[after-pack-adhoc-sign] Ad-hoc signing ${appPath}`);

  execFileSync(
    "codesign",
    [
      "--force",
      "--deep",
      "--options",
      "runtime",
      "--entitlements",
      entitlements,
      "--sign",
      "-",
      appPath,
    ],
    { stdio: "inherit" },
  );

  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
};
