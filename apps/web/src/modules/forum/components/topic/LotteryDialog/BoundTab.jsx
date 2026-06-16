'use client';

import { useEffect, useState } from 'react';
import { Gift, ArrowRight, Users, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * @param {object} props
 * @param {number} props.topicId
 * @param {(lotteryId:number)=>void} props.onInsert
 */
export default function BoundTab({ topicId, onInsert }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/lotteries/by-topic/${topicId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || '加载失败');
        }
        return res.json();
      })
      .then((d) => {
        if (cancelled) return;
        setItems(d.lotteries ?? []);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  if (loading) {
    return <div className="py-8 text-sm text-muted-foreground text-center">加载中…</div>;
  }
  if (error) {
    return <div className="py-8 text-sm text-destructive text-center">{error}</div>;
  }
  if (items.length === 0) {
    return (
      <div className="py-8 text-sm text-muted-foreground text-center">
        本话题暂无已绑抽奖。
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-2">
      {items.map((l) => (
        <div key={l.id} className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Gift className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {l.title.length > 60 ? l.title.slice(0, 60) + '…' : l.title}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{l.winnersCount} 名 × {l.pointsPerWinner} 积分</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />{l.participantsCount}
                </span>
                {l.status === 'drawn' && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <Trophy className="h-3 w-3" />已开奖
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => onInsert?.(l.id)}>
              <ArrowRight className="h-3 w-3" /> 重新插入正文
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
