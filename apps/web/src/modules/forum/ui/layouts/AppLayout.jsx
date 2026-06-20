import Header from '../globals/Header';
import Footer from '../globals/Footer';
import EmailVerificationBanner from '@/components/auth/EmailVerificationBanner';

export default function AppLayout({ children, apiInfo }) {

  return (
    <div className='min-h-screen bg-background text-foreground flex flex-col font-sans' style={{ '--header-offset': '89px' }}>
      <Header />
      <EmailVerificationBanner />
      <main className='flex-1 flex flex-col'>{children}</main>
      <Footer version={apiInfo?.version} />
    </div>
  );
}
