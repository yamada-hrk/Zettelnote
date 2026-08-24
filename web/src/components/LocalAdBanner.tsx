// ============================================================
// ローカルモード(未ログイン)×PCブラウザ限定で画面下部に表示する
// 広告バー(tmp/未ログイン体験の導入提案.md 3章参照)。
//
// ログイン済みユーザーの実際のメモを扱う画面には出さない。エディタ・
// 関連メモパネルなど実操作領域そのものには重ねず、画面最下部に
// 薄い帯として付加するだけに留める(アンカー広告的な配置)。
//
// AdSense審査が承認され、実際の広告ユニット(data-ad-slot)を作成する
// までは、このコンポーネントは枠だけを表示する(実際の広告は表示しない。
// 承認前に adsbygoogle.js を読み込んでも配信されないため)
// ============================================================
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/** AdSense管理画面で広告ユニットを作成した後、そのdata-ad-slot値に差し替える */
const AD_SLOT_ID = '';
const AD_CLIENT_ID = 'ca-pub-5401885500746261';

export default function LocalAdBanner() {
  const { t } = useTranslation();
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!AD_SLOT_ID || pushed.current) return;
    pushed.current = true;
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
      // AdSenseスクリプト未読み込み等でも致命的ではない
    }
  }, []);

  if (!AD_SLOT_ID) {
    // 広告ユニット未作成の間は、レイアウト確認用の枠だけ表示する
    return (
      <div className="flex h-[90px] shrink-0 items-center justify-center border-t border-white/5 bg-white/[0.02] text-[11px] text-slate-600">
        {t('localAd.placeholder')}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 justify-center border-t border-white/5 bg-white/[0.02] py-1">
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'inline-block', width: '728px', height: '90px' }}
        data-ad-client={AD_CLIENT_ID}
        data-ad-slot={AD_SLOT_ID}
      />
    </div>
  );
}
