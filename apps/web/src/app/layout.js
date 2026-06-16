import './globals.css';

import { AuthProvider } from '@/contexts/AuthContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LedgerProvider } from '@/extensions/ledger/contexts/LedgerContext';
import { EmojiProvider } from '@/components/common/Emoji/EmojiProvider';

// 决策 A：模块硬编码（无运行时开关），底座外壳由「当前业务模块」提供。
// 根布局直接引用 forum 模块的 AppLayout——这是有意的、与后端 modules/index.js 一致的组合根耦合；
// 换业务系统时在复制阶段改这一行（及 modules 注册），而非运行时切换。
import { AppLayout as AppLayoutComponent } from '@/modules/forum/ui';

import AutoCheckIn from '@/extensions/rewards/components/AutoCheckIn';
import ProgressBar from '@/components/common/ProgressBar';
import { getLayoutData, generateThemeScript, getLayoutMetadata } from '@/lib/server/layout';
import { Toaster } from '@/components/common/Toaster';
import { ConfirmPopoverPortal } from '@/components/common/ConfirmPopover';
import { AdsProvider } from '@/extensions/ads/components';
import { ChineseNewYear } from '@/components/effects/ChineseNewYear';


// 强制动态渲染，因为需要读取 cookies
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  return await getLayoutMetadata();
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

function AppLayout({ children, apiInfo }) {
  return <AppLayoutComponent apiInfo={apiInfo}>{children}</AppLayoutComponent>;
}

export default async function RootLayout({ children }) {
  // 获取所有 SSR 数据 (并行)
  const { settings, apiInfo, user, activeCurrencies } = await getLayoutData();

  // 生成初始化脚本
  const initScript = generateThemeScript();

  // 准备统计脚本
  const analyticsScript = settings?.site_analytics_scripts?.value || '';

  return (
    <html lang='en' suppressHydrationWarning className='overflow-y-scroll'>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body data-template="forum" className={`antialiased`}>
        {/* 自定义统计脚本注入 */}
        {analyticsScript && (
          <div 
             style={{ display: 'none' }} 
             dangerouslySetInnerHTML={{ __html: analyticsScript }} 
          />
        )}

        <ThemeProvider>
          <SettingsProvider initialSettings={settings}>
            <AuthProvider initialUser={user}>
              <LedgerProvider activeCurrencies={activeCurrencies}>
                <AdsProvider>
                <EmojiProvider>
                <ProgressBar>
                  <AppLayout apiInfo={apiInfo}>{children}</AppLayout>
                  <AutoCheckIn />
                  <Toaster />
                  <ConfirmPopoverPortal />
                  <ChineseNewYear />
                </ProgressBar>
                </EmojiProvider>
                </AdsProvider>
              </LedgerProvider>
            </AuthProvider>
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
