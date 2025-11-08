// Config plugin: enforce `use_modular_headers!` in Podfile to allow Swift pods with
// non-modular deps (e.g., FirebaseCoreInternal -> GoogleUtilities) to build as static libs.
const { withPodfile } = require('@expo/config-plugins');

module.exports = function withIosModularHeaders(config) {
  return withPodfile(config, (cfg) => {
    let contents = cfg.modResults.contents || '';

    if (!/use_modular_headers!\b/.test(contents)) {
      if (/^platform :ios, .*/m.test(contents)) {
        contents = contents.replace(/^platform :ios, .*\n/m, (m) => m + 'use_modular_headers!\n');
      } else {
        contents = 'use_modular_headers!\n' + contents;
      }
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
};


