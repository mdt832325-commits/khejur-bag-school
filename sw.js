/* ================================================================
   খেজুরবাগ ডিজিটাল স্কুল টু — PWA সার্ভিস ওয়ার্কার (অ্যাপ-শেল)
   ----------------------------------------------------------------
   এই ওয়ার্কারটাই অ্যাপটাকে "ইনস্টলযোগ্য" করে: হোম স্ক্রিনে বসানো,
   ব্রাউজার থেকে সরাসরি ইনস্টল, আর PWA থেকে APK বানানোর (যেমন
   PWABuilder) জন্য ব্রাউজার এই ওয়ার্কারটাই খোঁজে। কাজ:
   - অ্যাপের মূল ফাইলগুলো (পেজ, লোগো, আইকন, ম্যানিফেস্ট) ক্যাশে
     রাখে, যাতে নেট ধীর হলেও অ্যাপ দ্রুত খোলে, আর একবার খুললে
     অফলাইনেও অ্যাপের খোলসটা দেখা যায় (তথ্য লাইভ দেখতে নেট লাগে)।
   - পেজের অনুরোধে আগে নেট থেকে সর্বশেষটা আনে; নেট না থাকলে
     ক্যাশের কপিটা দেখায়।

   নোট: এটা হলো ফলব্যাক কপি। আসল ওয়ার্কারটা অ্যাপের রুটে sw.js
   নামে থাকে (scope পুরো অ্যাপ জুড়ে); যেসব হোস্টে রুটের ফাইলটা
   পাওয়া যায় না, শুধু সেখানেই পেজ এই কপিটা রেজিস্টার করে।
   এই কপিটা পেজের ভেতরেই বসানো; আসল ওয়ার্কারটা রুটে sw.js নামে
   থাকে (scope পুরো অ্যাপ জুড়ে) — পুশ নোটিফিকেশনের ব্যবস্থা
   আগের মতোই আলাদা ওয়ার্কারেই (FCM / OneSignal) থাকে।
   ================================================================ */

var CACHE_NAME = "khejur-bag-school-shell-v1";
var SHELL_FILES = [
  "/khejur-bag-school/",
  "/khejur-bag-school/index.html",
  "/khejur-bag-school/manifest.json",
  "/khejur-bag-school/icon-192.png",
  "/khejur-bag-school/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // একটা ফাইল না মিললেও বাকিগুলো যেন ক্যাশ হয় — তাই আলাদা আলাদা।
      return Promise.all(SHELL_FILES.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; // Firebase/OneSignal/CDN অনুরোধে হাত নয়

  if (req.mode === "navigate") {
    // পেজ: আগে নেট থেকে সর্বশেষ, না পেলে ক্যাশের কপি।
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put("/khejur-bag-school/index.html", copy).catch(function () {});
        });
        return res;
      }).catch(function () {
        return caches.match("/khejur-bag-school/index.html", { ignoreSearch: true })
          .then(function (hit) { return hit || caches.match("/khejur-bag-school/", { ignoreSearch: true }); });
      })
    );
    return;
  }

  // বাকি নিজস্ব ফাইল (ছবি, আইকন, ম্যানিফেস্ট): ক্যাশে থাকলে সেখান
  // থেকে, পাশাপাশি নেট থেকে নতুনটা এনে ক্যাশ আপডেট।
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy).catch(function () {});
          });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});
