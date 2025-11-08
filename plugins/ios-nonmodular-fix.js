// Config plugin to allow non-modular header includes for RNFirebase pods on iOS
const { withPodfile } = require('@expo/config-plugins');

module.exports = function withIosNonModularFix(config) {
  return withPodfile(config, (cfg) => {
    let contents = cfg.modResults.contents;

    const injection = `
  # Allow non-modular header includes for RNFirebase pods
  installer.pods_project.targets.each do |target|
    if ['RNFBApp', 'RNFBMessaging'].include? target.name
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end
  end
`;

    if (/post_install\s+do\s+\|installer\|/.test(contents)) {
      contents = contents.replace(/post_install\s+do\s+\|installer\|\n/, (m) => m + injection);
    } else {
      contents += `\npost_install do |installer|\n${injection}end\n`;
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
};


