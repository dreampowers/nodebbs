'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Gift,
  Loader2,
  CheckCircle2,
  Trophy,
  Users,
  Clock,
  Hourglass,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirm } from '@/components/common/ConfirmPopover';
import UserAvatar from '@/components/user/UserAvatar';
import Link from '@/components/common/Link';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const WRAPPER =
  'not-prose my-5 relative rounded-2xl px-5 py-5 bg-gradient-to-br from-amber-500/7 via-amber-500/2 to-amber-500/5 dark:from-amber-400/[0.09] dark:via-amber-400/[0.03]';

function formatRemaining(targetIso) {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return '已截止';
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${mins} 分`;
  return `${mins} 分`;
}

export default function LotteryWidget({ lotteryId }) {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const load = () => {
    if (!lotteryId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    fetch(`/api/lotteries/${lotteryId}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || '加载失败');
        }
        return res.json();
      })
      .then((d) => {
        if (d) setData(d);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotteryId]);

  const remaining = useMemo(() => {
    if (!data) return '';
    return formatRemaining(data.drawAt);
  }, [data]);

  if (loading) {
    return (
      <div className={`${WRAPPER} animate-pulse`}>
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-full bg-amber-500/20"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-3 bg-muted rounded w-3/4"></div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2">
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="not-prose my-5 px-4 py-3 rounded-2xl bg-muted/40 text-muted-foreground text-sm flex items-center gap-2">
        <Gift className="h-4 w-4" />
        该抽奖已被删除
      </div>
    );
  }

  if (error) {
    return (
      <div className="not-prose my-5 px-4 py-3 rounded-2xl bg-destructive/5 text-destructive text-sm">
        抽奖加载失败：{error}
      </div>
    );
  }

  if (!data) return null;

  const isOwner = isLoggedIn && data.userId === user?.id;
  const isPending = data.status === 'pending';
  const isDrawn = data.status === 'drawn';
  const isCancelled = data.status === 'cancelled';
  const isExpired = isPending && new Date(data.drawAt).getTime() <= Date.now();
  const canEnter = isPending && !isExpired;

  const submit = async () => {
    if (submitting) return;
    if (!isLoggedIn) {
      toast.error('请先登录');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lotteries/${lotteryId}/enter`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || '参与失败');
        return;
      }
      toast.success('参与成功，等待开奖');
      load();
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDraw = async (e) => {
    if (drawing) return;
    const ok = await confirm(e, {
      title: '确定立即开奖？',
      description: '此操作不可撤销。',
      confirmText: '开奖',
      variant: 'destructive',
    });
    if (!ok) return;
    setDrawing(true);
    try {
      const res = await fetch(`/api/lotteries/${lotteryId}/draw`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || '开奖失败');
        return;
      }
      toast.success('已开奖');
      load();
    } catch {
      toast.error('网络错误，请重试');
    } finally {
      setDrawing(false);
    }
  };

  return (
    <div className={WRAPPER}>
      {/* 头部：徽章 + 标题 + 状态 */}
      <div className="flex items-center gap-3">
        <div className="shrink-0 h-11 w-11 rounded-full bg-amber-500/15 dark:bg-amber-400/20 flex items-center justify-center ring-1 ring-amber-500/20 dark:ring-amber-400/30">
          <Gift className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-foreground leading-tight truncate">
            {data.title}
          </h3>
          <div className="shrink-0 text-xs text-muted-foreground">
            {isPending && !isExpired && (
              <span className="inline-flex items-center gap-1">
                <Hourglass className="h-3 w-3" /> {remaining}
              </span>
            )}
            {isExpired && isPending && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> 待开奖
              </span>
            )}
            {isDrawn && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                <Trophy className="h-3 w-3" /> 已开奖
              </span>
            )}
            {isCancelled && (
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> 已取消
              </span>
            )}
          </div>
        </div>
      </div>
      {data.description && (
        <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line">
          {data.description}
        </p>
      )}

      {/* 分隔渐变线 */}
      <div className="h-px my-4 bg-gradient-to-r from-amber-500/30 via-amber-500/10 to-transparent" />

      {/* 信息行 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {data.winnersCount}
          </div>
          <div className="text-xs text-muted-foreground">中奖名额</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {data.pointsPerWinner > 0 ? `${data.pointsPerWinner} 积分` : '仅奖品'}
          </div>
          <div className="text-xs text-muted-foreground">每位奖励</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground tabular-nums flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {data.participantsCount}
          </div>
          <div className="text-xs text-muted-foreground">已参与</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {new Date(data.drawAt).toLocaleString('zh-CN', { hour12: false })}
          </div>
          <div className="text-xs text-muted-foreground">开奖时间</div>
        </div>
      </div>

      {/* 门槛提示 */}
      {(data.minAccountDays > 0 || data.requireReply) && (
        <div className="text-xs mb-4 flex flex-wrap gap-1.5">
          {data.minAccountDays > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
              账号满 {data.minAccountDays} 天
            </span>
          )}
          {data.requireReply && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
              需回复话题
            </span>
          )}
        </div>
      )}

      {/* 参与者头像 */}
      {data.participants?.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-1.5">
            已参与（{data.participants.length}）
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.participants.map((p) => (
              <Link
                key={p.userId}
                href={`/users/${p.username}`}
                title={p.name || p.username}
                className="shrink-0 transition-opacity hover:opacity-70 no-underline"
              >
                <UserAvatar url={p.avatar} name={p.name || p.username} size="sm" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 中奖名单（无边框，柔和琥珀色背景） */}
      {isDrawn && (
        <div className="mb-4 p-4 rounded-xl bg-amber-500/[0.08] dark:bg-amber-400/[0.08]">
          <div className="text-sm font-medium mb-2 flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
            <Trophy className="h-4 w-4" />
            中奖名单（{data.winners?.length ?? 0} / {data.winnersCount}）
          </div>
          {data.winners?.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.winners.map((w) => (
                <Link
                  key={w.userId}
                  href={`/users/${w.username}`}
                  className={`text-xs px-2.5 py-1 rounded-full no-underline transition-opacity hover:opacity-80 ${
                    user?.id === w.userId
                      ? 'bg-amber-500 text-white dark:bg-amber-400 dark:text-amber-950 font-medium shadow-sm shadow-amber-500/30'
                      : 'bg-background/60 text-foreground/80'
                  }`}
                >
                  {w.name || w.username}
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">无人参与</div>
          )}
          {data.myIsWinner && (data.myPrizeItem || data.prizeDescription) && (
            <div className="mt-3 p-3 rounded-lg bg-background/70 text-sm whitespace-pre-line">
              <div className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-1">
                你的奖品
              </div>
              {data.myPrizeItem || data.prizeDescription}
            </div>
          )}
          {data.myIsWinner && data.pointsPerWinner > 0 && (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {data.pointsPerWinner} 积分已发放到你的账户
            </div>
          )}
          {/* creator 视图：奖品分配对照表 */}
          {isOwner && Array.isArray(data.prizeItems) && data.prizeItems.length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-background/70 text-xs">
              <div className="text-amber-700 dark:text-amber-400 font-medium mb-1.5">
                奖品分配（仅你可见）
              </div>
              <div className="space-y-1">
                {data.winners?.map((w) => (
                  <div key={w.userId} className="flex items-baseline gap-2">
                    <span className="font-medium text-foreground shrink-0">
                      {w.name || w.username}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="break-all whitespace-pre-line">{w.prizeItem ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 操作区 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {isPending && data.myParticipated && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> 已参与，等待开奖
            </span>
          )}
          {!isPending && !data.myParticipated && isDrawn && (
            <span>感谢关注</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isPending && isOwner && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDraw}
              disabled={drawing}
            >
              {drawing && <Loader2 className="h-3 w-3 animate-spin" />}
              提前开奖
            </Button>
          )}
          {canEnter && !data.myParticipated && !isOwner && (
            <Button
              type="button"
              size="sm"
              disabled={!isLoggedIn || submitting}
              onClick={submit}
              className="bg-amber-500 hover:bg-amber-600 text-white dark:bg-amber-400 dark:hover:bg-amber-500 dark:text-amber-950"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              {isLoggedIn ? '参与抽奖' : '登录后参与'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
