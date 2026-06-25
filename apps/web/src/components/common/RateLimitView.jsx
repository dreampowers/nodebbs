'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

// 持续被限速时，最多自动刷新几次后改为手动，避免后台标签页无限刷新冲击服务器
const MAX_AUTO_RELOADS = 3;
const RELOAD_COUNTER_KEY = 'rl_auto_reloads';
const RELOAD_COUNTER_TTL = 10 * 60 * 1000; // 仅累计 10 分钟内的连续自动刷新

function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s} 秒`;
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0 ? `${min} 分 ${sec} 秒` : `${min} 分钟`;
}

// 读取「短时间内已自动刷新次数」；超过 TTL 视为新一轮，计数归零
function readReloadCount() {
  try {
    const { count = 0, ts = 0 } = JSON.parse(sessionStorage.getItem(RELOAD_COUNTER_KEY) || '{}');
    return Date.now() - ts > RELOAD_COUNTER_TTL ? 0 : count;
  } catch {
    return 0;
  }
}

function bumpReloadCount() {
  try {
    sessionStorage.setItem(
      RELOAD_COUNTER_KEY,
      JSON.stringify({ count: readReloadCount() + 1, ts: Date.now() }),
    );
  } catch {
    // sessionStorage 不可用时静默忽略（至多退化为无上限自动刷新）
  }
}

/**
 * 限速（429）提示页。
 * @param {string} [resetTime] 后端预计恢复时间（ISO 字符串）——倒计时的权威来源。
 */
export default function RateLimitView({ resetTime }) {
  // resetTime 是真实时间戳，是倒计时的唯一来源
  const resetAt = resetTime ? new Date(resetTime).getTime() : NaN;
  const hasValidReset = Number.isFinite(resetAt);

  const [remaining, setRemaining] = useState(() =>
    hasValidReset ? Math.max(0, resetAt - Date.now()) : 0,
  );
  const [autoReloadStopped, setAutoReloadStopped] = useState(false);

  // 倒计时：仅由真实时间戳驱动，setState 传入计算好的值，保持更新函数纯净
  useEffect(() => {
    if (!hasValidReset) return;
    const id = setInterval(() => {
      setRemaining(Math.max(0, resetAt - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [resetAt, hasValidReset]);

  const expired = hasValidReset && remaining <= 0;

  // 到点后自动刷新一次（带次数上限）——副作用独立于 setState，便于清理且不会重复触发
  useEffect(() => {
    if (!expired) return;
    if (readReloadCount() >= MAX_AUTO_RELOADS) {
      setAutoReloadStopped(true);
      return;
    }
    const id = setTimeout(() => {
      bumpReloadCount();
      window.location.reload();
    }, 800);
    return () => clearTimeout(id);
  }, [expired]);

  const counting = hasValidReset && !expired;
  const showManualRefresh = !hasValidReset || autoReloadStopped;

  // 限速是全局状态：用 fixed 蒙层盖住整页，阻断对导航的点击——
  // 被限速时每次点击都会再发请求、再触发 429，既无意义又会延长限制。
  const dialogRef = useRef(null);
  useEffect(() => {
    dialogRef.current?.focus();
    // 锁定背景滚动
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevOverflow;
    };
  }, []);

  // 每个状态仅一句副标题；标题已说明「已触发访问限制」，此处不再重复
  let hint;
  if (counting) hint = '请稍候，倒计时结束后将自动重试';
  else if (expired) hint = autoReloadStopped ? '访问仍受限制，请稍后手动刷新页面' : '正在为您重新加载…';
  else hint = '请稍后重试';

  return (
    <div
      role='alertdialog'
      aria-modal='true'
      aria-labelledby='rate-limit-title'
      className='fixed inset-0 z-[100] flex items-center justify-center px-4 bg-background/80 backdrop-blur-sm'
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className='w-full max-w-sm rounded-2xl border bg-card p-8 text-center outline-none'
      >
        <div className='flex justify-center mb-6'>
          <div className='flex h-16 w-16 items-center justify-center rounded-full bg-muted'>
            <Clock className='h-8 w-8 text-muted-foreground' aria-hidden='true' />
          </div>
        </div>

        <h1 id='rate-limit-title' className='text-xl font-semibold text-foreground'>
          已触发访问限制
        </h1>

        {counting && (
          <div className='mt-5'>
            <div className='text-xs font-medium tracking-wide text-muted-foreground'>
              预计恢复还需
            </div>
            <div className='mt-1 font-mono text-3xl font-semibold tabular-nums text-foreground'>
              {formatCountdown(remaining)}
            </div>
          </div>
        )}

        <p className='mt-3 text-sm text-muted-foreground'>{hint}</p>

        {showManualRefresh && (
          <button
            type='button'
            onClick={() => window.location.reload()}
            className='mt-6 text-sm font-medium text-foreground underline-offset-4 hover:underline'
          >
            刷新页面
          </button>
        )}
      </div>
    </div>
  );
}
