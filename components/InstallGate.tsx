"use client";

import { useEffect, useState } from "react";

/**
 * On phones, Court Call has to be opened from the home screen (so notifications and sign-in work like a real app).
 * When someone opens the link in a phone browser, this shows step-by-step instructions for their exact phone and browser.
 */

type Platform =
  | "ios-safari"
  | "ios-chrome"
  | "ios-other"
  | "ios-old-other"
  | "in-app"
  | "android-chrome"
  | "android-samsung"
  | "android-firefox"
  | "android-other"
  | "desktop";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const SKIP_KEY = "cc-install-skip";

function iosVersion(ua: string): number {
  const m = ua.match(/OS (\d+)_(\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : 0;
}

function detect(): Platform {
  const ua = navigator.userAgent;
  const isIpadDesktopUA = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || isIpadDesktopUA;
  const android = /Android/.test(ua);
  if (!ios && !android) return "desktop";
  // Links opened inside Instagram, Facebook, Messenger, Snapchat, TikTok, LinkedIn, etc.
  if (/FBAN|FBAV|FB_IAB|Instagram|Messenger|Snapchat|musical_ly|TikTok|LinkedInApp|Line\/|GSA\/|Twitter/i.test(ua)) {
    return "in-app";
  }
  if (ios) {
    if (/CriOS/.test(ua)) return iosVersion(ua) >= 16.4 || isIpadDesktopUA ? "ios-chrome" : "ios-old-other";
    if (/FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave/.test(ua)) {
      return iosVersion(ua) >= 16.4 || isIpadDesktopUA ? "ios-other" : "ios-old-other";
    }
    return "ios-safari";
  }
  if (/SamsungBrowser/.test(ua)) return "android-samsung";
  if (/Firefox/.test(ua)) return "android-firefox";
  if (/Chrome/.test(ua) && !/EdgA|OPR|Opera|wv\)/.test(ua)) return "android-chrome";
  return "android-other";
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallGate({ children }: { children: React.ReactNode }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [show, setShow] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const p = detect();
    setPlatform(p);
    setShow(p !== "desktop" && !isStandalone() && sessionStorage.getItem(SKIP_KEY) !== "1");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!platform) return null;
  if (!show) return <>{children}</>;

  return (
    <InstallScreen
      platform={platform}
      installEvent={installEvent}
      onSkip={() => {
        sessionStorage.setItem(SKIP_KEY, "1");
        setShow(false);
      }}
    />
  );
}

/* ---------- Little drawings of the buttons people need to find ---------- */

const ShareIcon = () => (
  <svg className="ig-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share icon">
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);
const DotsIcon = () => (
  <svg className="ig-glyph" viewBox="0 0 24 24" fill="currentColor" aria-label="Three dots">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);
const VDotsIcon = () => (
  <svg className="ig-glyph" viewBox="0 0 24 24" fill="currentColor" aria-label="Three dots menu">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);
const MenuIcon = () => (
  <svg className="ig-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="Menu">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
const PlusSquare = () => (
  <svg className="ig-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="Add to Home Screen icon">
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

type Step = React.ReactNode;

function stepsFor(p: Platform): { title: string; steps: Step[]; note?: React.ReactNode } {
  switch (p) {
    case "ios-safari":
      return {
        title: "iPhone or iPad (Safari)",
        steps: [
          <>
            Tap the <b>Share</b> button <ShareIcon />. It&apos;s at the bottom of the screen on iPhone, or the top on iPad.
            <span className="ig-alt">
              Newer iPhones (iOS 26): if you don&apos;t see it, tap <b>•••</b> <DotsIcon /> next to the address bar first,
              then <b>Share</b>.
            </span>
          </>,
          <>
            Scroll down and tap <b>Add to Home Screen</b> <PlusSquare />.
            <span className="ig-alt">Don&apos;t see it? Tap <b>View More</b> or <b>Edit Actions</b> at the bottom of the list.</span>
          </>,
          <>
            Leave <b>Open as Web App</b> switched on if you see it, then tap <b>Add</b> in the top right corner.
          </>,
          <>
            Close Safari and open <b>Court Call</b> from your home screen.
          </>,
        ],
      };
    case "ios-chrome":
      return {
        title: "iPhone or iPad (Chrome)",
        steps: [
          <>
            Tap the <b>Share</b> button <ShareIcon /> at the right end of the address bar at the top.
            <span className="ig-alt">
              If it&apos;s not there, tap <b>•••</b> <DotsIcon /> at the bottom right, then <b>Share</b>.
            </span>
          </>,
          <>
            Tap <b>Add to Home Screen</b> <PlusSquare />. Scroll down or tap <b>More</b> if you don&apos;t see it.
          </>,
          <>
            Tap <b>Add</b>.
          </>,
          <>
            Open <b>Court Call</b> from your home screen.
          </>,
        ],
        note: <>Easiest option: open this page in <b>Safari</b> instead, using the same steps.</>,
      };
    case "ios-other":
      return {
        title: "iPhone or iPad",
        steps: [
          <>
            Tap your browser&apos;s <b>Share</b> button <ShareIcon />. It&apos;s usually in the address bar or behind the menu
            (<DotsIcon /> or <MenuIcon />).
          </>,
          <>
            Tap <b>Add to Home Screen</b> <PlusSquare />, then <b>Add</b>.
          </>,
          <>
            Open <b>Court Call</b> from your home screen.
          </>,
        ],
        note: <>If you can&apos;t find it, copy the link below and open it in <b>Safari</b>. That always works.</>,
      };
    case "ios-old-other":
      return {
        title: "Open this in Safari",
        steps: [
          <>
            On your iPhone&apos;s version, only <b>Safari</b> can add apps to the home screen. Tap <b>Copy link</b> below.
          </>,
          <>
            Open <b>Safari</b>, tap the address bar, paste, and go.
          </>,
          <>
            Then tap <b>Share</b> <ShareIcon />, then <b>Add to Home Screen</b> <PlusSquare />, then <b>Add</b>.
          </>,
        ],
      };
    case "in-app":
      return {
        title: "Open this in your phone's browser first",
        steps: [
          <>
            You opened the link inside another app. Tap <b>•••</b> <DotsIcon /> or <VDotsIcon /> at the top or bottom
            corner of the screen.
          </>,
          <>
            Choose <b>Open in Safari</b>, <b>Open in browser</b>, or <b>Open in Chrome</b>.
            <span className="ig-alt">No option like that? Tap <b>Copy link</b> below and paste it into Safari (iPhone) or Chrome (Android).</span>
          </>,
          <>
            This screen will show up again there with the last couple of steps.
          </>,
        ],
      };
    case "android-chrome":
      return {
        title: "Android (Chrome)",
        steps: [
          <>
            Tap the <b>⋮</b> menu <VDotsIcon /> in the top right corner.
          </>,
          <>
            Tap <b>Add to Home screen</b> or <b>Install app</b>.
          </>,
          <>
            Tap <b>Install</b> (or <b>Add</b>), and confirm if asked.
          </>,
          <>
            Open <b>Court Call</b> from your home screen or app drawer.
          </>,
        ],
      };
    case "android-samsung":
      return {
        title: "Samsung Internet",
        steps: [
          <>
            Tap the <b>menu</b> <MenuIcon /> at the bottom right.
          </>,
          <>
            Tap <b>Add page to</b>, then <b>Home screen</b>. On some versions it says <b>Install</b> or shows a{" "}
            <PlusSquare /> icon in the address bar, which you can tap directly.
          </>,
          <>
            Tap <b>Add</b>, then open <b>Court Call</b> from your home screen.
          </>,
        ],
      };
    case "android-firefox":
      return {
        title: "Android (Firefox)",
        steps: [
          <>
            Tap the <b>⋮</b> menu <VDotsIcon />. It may be at the top or bottom right.
          </>,
          <>
            Tap <b>Add to Home screen</b> or <b>Install</b>. On some versions it&apos;s under <b>Add app to Home screen</b>.
          </>,
          <>
            Tap <b>Add</b>, then open <b>Court Call</b> from your home screen.
          </>,
        ],
      };
    case "android-other":
    default:
      return {
        title: "Android",
        steps: [
          <>
            Open your browser&apos;s menu, usually <b>⋮</b> <VDotsIcon /> or <MenuIcon /> in a corner.
          </>,
          <>
            Tap <b>Add to Home screen</b> or <b>Install app</b>, then <b>Add</b>.
          </>,
          <>
            Open <b>Court Call</b> from your home screen.
          </>,
        ],
        note: <>Can&apos;t find it? Copy the link below and open it in <b>Chrome</b>.</>,
      };
  }
}

const OTHER_GUIDES: Platform[] = ["ios-safari", "ios-chrome", "android-chrome", "android-samsung", "in-app"];

function InstallScreen({
  platform,
  installEvent,
  onSkip,
}: {
  platform: Platform;
  installEvent: BeforeInstallPromptEvent | null;
  onSkip: () => void;
}) {
  const [guide, setGuide] = useState<Platform>(platform);
  const [copied, setCopied] = useState(false);
  const { title, steps, note } = stepsFor(guide);
  const link = typeof window !== "undefined" ? window.location.origin : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy this link:", link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <main className="install">
      <div className="install-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={76} height={76} />
        <h1>Add Court Call to your home screen</h1>
        <p className="muted">
          It takes about 20 seconds. Court Call then opens like a regular app, stays signed in, and can send you court
          alerts.
        </p>
      </div>

      {installEvent && guide === platform && (
        <button
          className="btn primary install-now"
          onClick={async () => {
            await installEvent.prompt();
            await installEvent.userChoice.catch(() => null);
          }}
        >
          Install Court Call
        </button>
      )}

      <section className="card install-card">
        <div className="install-for">{title}</div>
        <ol className="install-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="num">{i + 1}</span>
              <div>{s}</div>
            </li>
          ))}
        </ol>
        {note && <p className="install-note">{note}</p>}
        <button className="btn ghost copy" onClick={copy}>
          {copied ? "✓ Link copied" : "Copy link"}
        </button>
      </section>

      <div className="install-other">
        <div className="muted small">Different phone or browser?</div>
        <div className="chips-row">
          {OTHER_GUIDES.filter((g) => g !== guide).map((g) => (
            <button key={g} className="mini-chip" onClick={() => setGuide(g)}>
              {stepsFor(g).title}
            </button>
          ))}
          {guide !== platform && (
            <button className="mini-chip" onClick={() => setGuide(platform)}>
              Back to my phone
            </button>
          )}
        </div>
      </div>

      <button className="skip" onClick={onSkip}>
        Having trouble? Continue in the browser for now
      </button>
    </main>
  );
}
