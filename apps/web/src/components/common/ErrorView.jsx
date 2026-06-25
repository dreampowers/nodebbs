'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import Link from '@/components/common/Link';
import RateLimitView from '@/components/common/RateLimitView';
import { parseRateLimitError } from '@/lib/rate-limit-error';

/**
 * 错误边界（error.js）通用展示组件。
 * 统一处理：错误日志、限速（429）识别 → RateLimitView、以及标准错误 UI。
 * 新增路由段的 error.js 直接复用本组件即可自动获得限速处理，无需各自重复实现。
 *
 * @param {Error}    error       错误对象（来自 Next.js error 边界）
 * @param {Function} reset       Next.js 提供的重试函数
 * @param {string}   [logLabel]  console.error 前缀
 * @param {string}   [title]     非限速错误的标题
 * @param {string}   [description] 非限速错误的描述
 */
export default function ErrorView({
  error,
  reset,
  logLabel = '[页面错误]',
  title = '出错了',
  description = '页面加载时出现错误，请重试或稍后再试。',
}) {
  useEffect(() => {
    console.error(logLabel, error);
  }, [logLabel, error]);

  const rateLimitInfo = parseRateLimitError(error);
  if (rateLimitInfo) {
    return <RateLimitView resetTime={rateLimitInfo.resetTime} />;
  }

  return (
    <div className='flex-1 flex items-center justify-center px-4 py-16'>
      <div className='max-w-md w-full text-center'>
        <div className='flex justify-center mb-6'>
          <div className='rounded-full bg-destructive/10 p-5'>
            <AlertCircle className='w-12 h-12 text-destructive' />
          </div>
        </div>

        <h1 className='text-xl font-semibold text-foreground mb-2'>
          {title}
        </h1>

        <p className='text-sm text-muted-foreground mb-6'>
          {description}
        </p>

        {process.env.NODE_ENV === 'development' && error?.message && (
          <div className='mb-8 p-4 bg-muted rounded-lg text-left mx-auto max-w-sm'>
            <p className='text-xs font-mono text-destructive break-all'>
              {error.message}
            </p>
          </div>
        )}

        <div className='flex items-center justify-center gap-3'>
          <Button variant='default' size='sm' onClick={() => reset()}>
            <RefreshCw className='h-4 w-4' />
            重试
          </Button>

          <Button asChild variant='outline' size='sm'>
            <Link href='/'>
              <Home className='h-4 w-4' />
              返回首页
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
