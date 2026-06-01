'use client';

import { useSettings } from '@/contexts/SettingsContext';
import SidebarFooter from './SidebarFooter';

/**
 * Jatra 右侧栏
 * 结构：
 *   卡片1 — 关于社区（独立卡片，内容来自 settings.site_description）
 *   卡片2 — 统计信息 + 在线用户（合并卡片）
 *   底部  — 页脚信息（版权、链接、NodeBBS 标识）
 */
export default function RightSidebar({ stats, version }) {
  const { getSetting } = useSettings();
  const siteDescription = getSetting('site_description', '');

  return (
    <div className='flex flex-col gap-4 w-full'>
      {/* 卡片1：关于社区 */}
      {siteDescription && (
        <div className='jatra-card p-4'>
          <h3 className='font-bold text-foreground mb-2 text-[13px] flex items-center gap-2'>
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"></span>
            关于社区
          </h3>
          <p className='text-xs text-muted-foreground leading-relaxed'>
            {siteDescription}
          </p>
        </div>
      )}

      {/* 卡片2：统计信息 + 在线用户 */}
      {stats ? <StatsPanel stats={stats} /> : null}

      {/* 底部：页脚信息 */}
      <SidebarFooter version={version} />
    </div>
  );
}

function StatsPanel({ stats }) {
  return (
    <div className='jatra-card p-4'>
        <h3 className='font-bold text-foreground mb-3 text-[13px] flex items-center gap-2'>
          <span className="w-1.5 h-1.5 rounded-full bg-chart-1 shrink-0"></span>
          社区数据
        </h3>
        {/* 统计数字 */}
        <div className='grid grid-cols-3 gap-2'>
          <div className='text-center'>
            <div className='text-base font-bold text-foreground'>{stats.totalTopics ?? 0}</div>
            <div className='text-[10px] text-muted-foreground'>话题</div>
          </div>
          <div className='text-center'>
            <div className='text-base font-bold text-foreground'>{stats.totalPosts ?? 0}</div>
            <div className='text-[10px] text-muted-foreground'>回复</div>
          </div>
          <div className='text-center'>
            <div className='text-base font-bold text-foreground'>{stats.totalUsers ?? 0}</div>
            <div className='text-[10px] text-muted-foreground'>用户</div>
          </div>
        </div>

        {/* 在线状态 */}
        <div className='mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-sm text-muted-foreground'>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse"></span>
          当前 <span className='font-semibold text-foreground'>{stats.online.total ?? 0}</span> 人在线
        </div>
      </div>
  );
}