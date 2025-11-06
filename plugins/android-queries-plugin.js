// Simple config plugin to append <queries> packages required by EasyPay guide
const { withAndroidManifest } = require('@expo/config-plugins');

const PACKAGES = [
  'com.shinhan.sbanking',
  'com.shcard.smartpay',
  'com.shinhancard.smartshinhan',
  'com.mobiletoong.travelwallet',
  'com.shinhan.smartcaremgr',
  'kr.co.samsungcard.mpocket',
  'net.ib.android.smcard',
  'com.kbcard.cxh.appcard',
  'com.kbstar.liivbank',
  'com.kbstar.kbbank',
  'com.kbstar.reboot',
  'nh.smart.nhallonepay',
  'com.nh.cashcardapp',
  'com.lcacApp',
  'kvp.jjy.MispAndroid320',
  'com.hanaskcard.paycla',
  'kr.co.hanamembers.hmscustomer',
  'com.hanaskcard.rocomo.potal',
  'kr.co.citibank.citimobile',
  'com.wooricard.smartapp',
  'com.wooribank.smart.npib',
  'com.hyundaicard.appcard',
  'com.lumensoft.touchenappfree',
  'com.TouchEn.mVaccine.webs',
  'kr.co.shiftworks.vguardweb',
  'com.ahnlab.v3mobileplus',
  'com.nhnent.payapp',
  'com.samsung.android.spay',
  'com.samsung.android.spaylite',
  'com.lge.lgpay',
  'com.ssg.serviceapp.android.egiftcertificate',
  'com.lottemembers.android',
  'com.nhn.android.search',
  'com.kakao.talk',
  'com.kftc.bankpay.android',
  'viva.republica.toss',
  'com.lgt.tmoney',
  'com.sktelecom.tauth',
  'com.kt.ktauth',
  'com.lguplus.smartotp',
];

function ensureQueries(manifest) {
  if (!manifest.manifest) return manifest;
  const app = manifest.manifest;
  app.queries = app.queries || [{}];
  const queries = app.queries[0];
  queries.package = queries.package || [];
  const existing = new Set((queries.package || []).map((p) => p.$ && p.$.name));
  PACKAGES.forEach((pkg) => {
    if (!existing.has(pkg)) {
      queries.package.push({ $: { name: pkg } });
    }
  });
  return manifest;
}

module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = ensureQueries(cfg.modResults);
    return cfg;
  });
};


