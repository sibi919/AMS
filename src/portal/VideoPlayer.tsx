import { useEffect, useRef, useState } from "react";
import { supabase } from "../auth/client";

type Player = {
  getCurrentTime: () => number;
  getDuration?: () => number;
  getPlayerState: () => number;
  getPlaybackRate: () => number;
  destroy: () => void;
};
declare global {
  interface Window {
    YT?: { Player: new (element: HTMLElement, options: Record<string, unknown>) => Player };
    onYouTubeIframeAPIReady?: () => void;
  }
}
let ready: Promise<void> | null = null;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve();
  if (!ready) ready = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => { ready = null; script.remove(); reject(new Error("YouTube player did not load.")); }, 15000);
    window.onYouTubeIframeAPIReady = () => { window.clearTimeout(timeout); previous?.(); resolve(); };
    script.onerror = () => { window.clearTimeout(timeout); ready = null; script.remove(); reject(new Error("YouTube player is unavailable.")); };
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.append(script);
  });
  return ready;
}
export function VideoPlayer({ lesson, student, live = false }: {
  lesson: { id: string; title: string; youtube_id: string; duration_seconds?: number };
  student: boolean; live?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let disposed = false, playing = false, pending = false;
    let player: Player | null = null;
    let watch: string | null = null;
    let interval: number | undefined;
    let observed = 0;
    const host = container.current;
    if (!host) return;
    const frame = document.createElement("iframe");
    frame.className = "academy-video";
    frame.title = lesson.title + " YouTube player";
    frame.src = "https://www.youtube-nocookie.com/embed/" + lesson.youtube_id + "?enablejsapi=1&playsinline=1&origin=" + encodeURIComponent(window.location.origin);
    frame.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allowFullscreen = true;
    host.append(frame);
    const say = (value: string) => { if (!disposed) setMessage(value); };
    const detectDuration = async () => {
      const duration = Math.round(player?.getDuration?.() ?? 0);
      if (live || duration < 60 || duration > 21600 || observed === duration || !supabase) return;
      observed = duration;
      if (!student) {
        const { error } = await supabase.rpc("academy_record_duration", { lesson: lesson.id, seconds: duration });
        say(error ? "Video duration could not be saved. Verify it in the lesson editor." : "YouTube duration verified: " + Math.round(duration / 60) + " min. Official class duration is managed in Class sessions.");
      } else if (lesson.duration_seconds && Math.abs(duration - lesson.duration_seconds) > 2) {
        say("The stored video duration needs teacher verification. Playback continues; attendance may be incomplete until corrected.");
      }
    };
    // No catch-up credit: after a failed heartbeat, reopen at the CURRENT
    // playhead. This prevents the unverified gap from becoming attendance.
    const heartbeat = async (position: number, credit: boolean) => {
      if (!student || !supabase || pending || disposed) return;
      pending = true;
      try {
        if (!watch) {
          if (!playing || !credit) return;
          const { data, error } = await supabase.rpc(live ? "live_watch_start" : "watch_start",
            live ? { live: lesson.id, playhead: position } : { lesson: lesson.id, playhead: position });
          if (error) throw error;
          watch = String(data);
          say("Attendance connected · Normal speed · One class at a time");
        } else {
          const { error } = await supabase.rpc(live ? "live_watch_ping" : "watch_ping", { watch, playhead: position, playing: credit });
          if (error) throw error;
        }
      } catch {
        watch = null;
        say("Attendance is temporarily unavailable. Playback continues; tracking will retry automatically. Unverified time is not credited.");
      } finally { pending = false; }
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible" && player) {
        // Invalidate this interval; background playback is never counted.
        void heartbeat(player.getCurrentTime(), false);
        watch = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void loadYouTube().then(() => {
      if (disposed || !window.YT) return;
      player = new window.YT.Player(frame, {
        events: {
          onReady: () => void detectDuration(),
          onError: () => say("This video cannot be played here. Ask your teacher to check the video and embedding settings."),
          onStateChange: (event: { data: number }) => {
            if (disposed || !player) return;
            void detectDuration();
            const wasPlaying = playing;
            playing = event.data === 1;
            const eligible = document.visibilityState === "visible" && player.getPlaybackRate() === 1;
            if (playing && !wasPlaying) void heartbeat(player.getCurrentTime(), eligible);
            else if (!playing && wasPlaying) void heartbeat(player.getCurrentTime(), eligible);
          },
          onPlaybackRateChange: () => {
            if (student && player) { void heartbeat(player.getCurrentTime(), false); watch = null; say("Use normal (1×) speed for attendance."); }
          },
        },
      });
      interval = window.setInterval(() => {
        if (disposed || !playing || !player || player.getPlayerState() !== 1) return;
        void heartbeat(player.getCurrentTime(), document.visibilityState === "visible" && player.getPlaybackRate() === 1);
      }, 10000);
    }).catch((error: Error) => say(error.message + " The embedded player remains available; attendance requires the player connection."));
    return () => {
      if (watch && player && student && supabase) {
        void supabase.rpc(live ? "live_watch_ping" : "watch_ping", { watch, playhead: player.getCurrentTime(), playing: playing && document.visibilityState === "visible" && player.getPlaybackRate() === 1 });
      }
      disposed = true;
      if (interval) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      player?.destroy();
      frame.remove();
    };
  }, [lesson.id, lesson.youtube_id, lesson.title, lesson.duration_seconds, student, live]);
  return <><div ref={container} />{message && <p role="status" className="portal-muted">{message}</p>}</>;
}
