// Simple config plugin to append <queries> packages and intent schemes (Android 11+ visibility) for Korean payment apps
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
  // Add missing Woori older package id used by some PGs
  'com.wooricard.wcard',
];

// Known payment/auth schemes often launched via intent:// or direct scheme
const SCHEMES = [
  'ispmobile',
  'kb-acp',
  'liivbank',
  'newliiv',
  'kbbank',
  'shinhan-sr-ansimclick',
  'shinhan-sr-ansimclick-lpay',
  'shinhan-sr-ansimclick-naverpay',
  'shinhan-sr-ansimclick-payco',
  'smshinhanansimclick',
  'travelwallet',
  'nhallonepayansimclick',
  'npappcardansimclick',
  'nonghyupcardansimclick',
  'lottesmartpay',
  'lotteappcard',
  'mpocket.online.ansimclick',
  'cloudpay',
  'hanawalletmembers',
  'hdcardappcardansimclick',
  // Some docs use a misspelling; include both to be safe
  'smhyndaiansimclick',
  'smhyundaiansimclick',
  'newsmartpib',
  'citimobileapp',
  'citicardappkr',
  'samsungpay',
  'naversearchthirdlogin',
  'kakaotalk',
  'payco',
  'lpayapp',
  'shinsegaeeaypayment',
  'supertoss',
  'kftc-bankpay',
  'tmoney',
  'appfree',
  'mvaccinestart',
  'vguardstart',
  'v3mobileplusweb',
  'tauthlink',
  'ktauthexternalcall',
  'upluscorpoation',
  'monimopay',
  'monimopayauth',
  // Common market fallback
  'market',
];

function ensureQueries(modResults) {
  if (!modResults.manifest) return modResults;
  const root = modResults.manifest;
  // Ensure <queries> element exists
  root.queries = root.queries || [{}];
  const queriesEl = root.queries[0];

  // 1) Ensure <package> entries
  queriesEl.package = queriesEl.package || [];
  const existingPackages = new Set(
    (queriesEl.package || []).map((p) => (p.$ && (p.$['android:name'] || p.$.name)) || '')
  );
  PACKAGES.forEach((pkg) => {
    if (!existingPackages.has(pkg)) {
      queriesEl.package.push({ $: { 'android:name': pkg } });
    }
  });

  // 2) Ensure <intent> entries per scheme for ACTION_VIEW
  queriesEl.intent = queriesEl.intent || [];
  const intentKey = (it) => {
    const scheme = it?.data?.[0]?.$?.['android:scheme'] || '';
    return scheme;
  };
  const existingIntents = new Set((queriesEl.intent || []).map((it) => intentKey(it)));

  SCHEMES.forEach((scheme) => {
    if (!scheme || existingIntents.has(scheme)) return;
    queriesEl.intent.push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      data: [{ $: { 'android:scheme': scheme } }],
    });
    existingIntents.add(scheme);
  });

  return modResults;
}

module.exports = function withAndroidQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = ensureQueries(cfg.modResults);
    return cfg;
  });
};

 
