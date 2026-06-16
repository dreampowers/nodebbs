'use client';

import { useEffect, useState } from 'react';
import { BarChart3, ArrowRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * @param {object} props
 * @param {number} props.topicId
 * @param {(pollId:number)=>void} props.onInsert
 */
export default function BoundTab({ topicId, onInsert }) {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/polls/by-topic/${topicId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || '加载失败');
        }
        return res.json();
      })
      .then((d) => {
        if (cancelled) return;
        setPolls(d.polls ?? []);
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
  if (polls.length === 0) {
    return (
      <div className="py-8 text-sm text-muted-foreground text-center">
        本话题暂无已绑投票。
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-2">
      {polls.map((p) => (
        <div key={p.id} className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <BarChart3 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {p.question.length > 60 ? p.question.slice(0, 60) + '…' : p.question}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <span>{p.selectionType === 'single' ? '单选' : '多选'}</span>
                <span>·</span>
                <span>{p.isAnonymous ? '匿名' : '实名'}</span>
                <span>·</span>
                <span>{p.options?.length ?? 0} 选项</span>
                <span>·</span>
                <Users className="h-3 w-3" />
                <span>{p.totalVoters ?? 0} 人投票</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => onInsert?.(p.id)}>
              <ArrowRight className="h-3 w-3" /> 重新插入正文
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
