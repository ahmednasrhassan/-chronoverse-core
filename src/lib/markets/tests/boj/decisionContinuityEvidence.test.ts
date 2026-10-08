import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as api from "../../providers/boj/decisionContinuityEvidence";
import { parseBojDecisionContinuityEvidenceV1 as parse } from "../../providers/boj/decisionContinuityEvidence";
import { buildUnavailableOfficialPolicyPredecessorProofV1 } from "../../events/officialPolicyPredecessorProof";
import { readBojPolicyDecisionCaptureAsKnownAtV1 } from "../../services/bojPolicyDecisionCaptureAuthority";

// Complete, unchanged <main> from the official source inspected during implementation.
// URL: https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2024/g240614.htm
// Lines retain original line endings/whitespace inside strings; no network is used by tests.
// SHA-256 is a fixture-integrity check, not publisher authentication or historical acquisition.
const officialMain = [
  "<main id=\"contents\">\r\n",
  "      <h1>\n",
  "Minutes of the\n",
  "Monetary Policy Meeting\n",
  "<span>on June 13 and 14, 2024</span>\n",
  "</h1>\r\n",
  "      <!-- ▼▼　日本語・英語切り替え　▼▼-->\r\n",
  "      \r\n",
  "      <!-- ▲▲　日本語・英語切り替え　▲▲-->\r\n",
  "      <!-- ▼▼　コンテンツ　▼▼-->\r\n",
  "      <div class=\"outline mod_outer\">\r\n",
  "      <!-- [START] CONTENT_1 --><p>August 5, 2024<br>\n",
  "Bank of Japan</p>\n",
  "<p>(English translation prepared by the Bank's staff based on the Japanese original)</p>\n",
  "<ul class=\"link-list01\">\n",
  "\t<li><a href=\"/en/mopo/mpmsche_minu/minu_2024/g240614.pdf\">PDF Version [PDF 375KB]</a></li>\n",
  "</ul><!-- [END] CONTENT_1 --><!-- [START] CONTENT_2 --><p>A Monetary Policy Meeting of the Bank of Japan Policy Board was held in the Head Office of the Bank of Japan in\n",
  "    Tokyo on Thursday, June 13, 2024, from 2:00 p.m. to 3:33 p.m., and on Friday, June 14, from 9:00 a.m. to 12:16\n",
  "    p.m.<sup><a href=\"#fn1\" id=\"p1\" class=\"red\">1</a></sup></p>\n",
  "<div class=\"ml25em\">\n",
  "    <dl class=\"mt2em\">\n",
  "        <dt><strong>Policy Board Members Present</strong></dt>\n",
  "        <dd class=\"ml2em\">\n",
  "            <ul class=\"no-list\">\n",
  "                <li class=\"mt0 mb0\"><strong>UEDA Kazuo, Chairman, Governor of the Bank of Japan</strong></li>\n",
  "                <li class=\"mt0 mb0\"><strong>HIMINO Ryozo, Deputy Governor of the Bank of Japan</strong></li>\n",
  "                <li class=\"mt0 mb0\"><strong>UCHIDA Shinichi, Deputy Governor of the Bank of Japan</strong></li>\n",
  "                <li class=\"mt0 mb0\"><strong>ADACHI Seiji</strong></li>\n",
  "                <li class=\"mt0 mb0\"><strong>NAKAMURA Toyoaki</strong></li>\n",
  "                <li class=\"mt0 mb0\"><strong>NOGUCHI Asahi</strong></li>\n",
  "                <li class=\"mt0 mb0\"><strong>NAKAGAWA Junko</strong></li>\n",
  "                <li class=\"mt0 mb0\"><strong>TAKATA Hajime</strong></li>\n",
  "                <li class=\"mt0 mb0\"><strong>TAMURA Naoki</strong></li>\n",
  "            </ul>\n",
  "        </dd>\n",
  "    </dl>\n",
  "    <dl>\n",
  "        <dt class=\"mt2em\">Government Representatives Present</dt>\n",
  "        <dd class=\"ml2em\">\n",
  "            <ul class=\"no-list\">\n",
  "                <li class=\"mt0 mb0\">AKAZAWA Ryosei, State Minister of Finance, Ministry of Finance<sup><a href=\"#fn2\" id=\"p2\" class=\"red\">2</a></sup></li>\n",
  "                <li class=\"mt0 mb0\">SAKAMOTO Motoru, Deputy Vice-Minister for Policy Planning and Coordination, Ministry\n",
  "                    of Finance<sup><a href=\"#fn3\" id=\"p3\" class=\"red\">3</a></sup></li>\n",
  "                <li class=\"mt0 mb0\">SHINDO Yoshitaka, Minister of State for Economic and Fiscal Policy, Cabinet\n",
  "                    Office<sup><a href=\"#fn4\" id=\"p4\" class=\"red\">4</a></sup></li>\n",
  "                <li class=\"mt0 mb0\">INOUE Hiroyuki, Vice-Minister for Policy Coordination, Cabinet Office<sup><a href=\"#fn3\" id=\"p5\" class=\"red\">3</a></sup></li>\n",
  "                <li class=\"mt0 mb0\">MORO Kengo, Deputy Director General for Economic and Fiscal Management, Cabinet\n",
  "                    Office<sup><a href=\"#fn5\" class=\"red\">5</a></sup></li>\n",
  "            </ul>\n",
  "        </dd>\n",
  "    </dl>\n",
  "    <dl>\n",
  "        <dt class=\"mt2em\">Reporting Staff</dt>\n",
  "        <dd class=\"ml2em\">\n",
  "            <ul class=\"no-list\">\n",
  "                <li class=\"mt0 mb0\">KAIZUKA Masaaki, Executive Director</li>\n",
  "                <li class=\"mt0 mb0\">KATO Takeshi, Executive Director</li>\n",
  "                <li class=\"mt0 mb0\">SHIMIZU Seiichi, Executive Director (Assistant Governor) </li>\n",
  "                <li class=\"mt0 mb0\">MASAKI Kazuhiro, Director-General, Monetary Affairs Department</li>\n",
  "                <li class=\"mt0 mb0\">NAGANO Teppei, Head of Policy Planning Division, Monetary Affairs Department</li>\n",
  "                <li class=\"mt0 mb0\">FUJITA Kenji, Director-General, Financial Markets Department</li>\n",
  "                <li class=\"mt0 mb0\">NAKAMURA Koji, Director-General, Research and Statistics Department</li>\n",
  "                <li class=\"mt0 mb0\">NAGAHATA Takashi, Head of Economic Research Division, Research and Statistics\n",
  "                    Department</li>\n",
  "                <li class=\"mt0 mb0\">CHIKADA Ken, Director-General, International Department</li>\n",
  "            </ul>\n",
  "        </dd>\n",
  "    </dl>\n",
  "    <dl>\n",
  "        <dt class=\"mt2em\">Secretariat of the Monetary Policy Meeting</dt>\n",
  "        <dd class=\"ml2em\">\n",
  "            <ul class=\"no-list\">\n",
  "                <li class=\"mt0 mb0\">HARIMOTO Keiko, Director-General, Secretariat of the Policy Board</li>\n",
  "                <li class=\"mt0 mb0\">KINOSHITA Takao, Director, Deputy Head of Planning and Coordination Division,\n",
  "                    Secretariat of the Policy Board</li>\n",
  "                <li class=\"mt0 mb0\">KITAHARA Jun, Senior Economist, Monetary Affairs Department</li>\n",
  "                <li class=\"mt0 mb0\">KURACHI Yoshiyuki, Senior Economist, Monetary Affairs Department</li>\n",
  "            </ul>\n",
  "        </dd>\n",
  "    </dl>\n",
  "</div>\n",
  "<h2><span aria-hidden=\"true\">I</span><span class=\"txt-hide\">1</span>. Summary of Staff Reports on Economic and Financial\n",
  "    Developments<sup><a href=\"#fn6\" id=\"p6\" class=\"red\" style=\"background: none; padding: 0px;\">6</a></sup></h2>\n",
  "<h3>A. Market Operations in the Intermeeting Period</h3>\n",
  "<p>The Bank had been conducting money market operations in accordance with the guideline for money market operations decided at the previous meeting on April 25 and 26, 2024.<sup><a href=\"#fn7\" id=\"p7\" class=\"red\" style=\"background: none; padding: 0px;\">7</a></sup> The uncollateralized overnight call rate had been in the range of 0.076 to 0.078 percent.</p>\n",
  "<p>Meanwhile, regarding purchases of Japanese government bonds (JGBs), CP, and corporate bonds, the Bank conducted the purchases in accordance with the decisions made at the March 2024 meeting.</p>\n",
  "<h3>B. Recent Developments in Financial Markets</h3>\n",
  "<p>In the money market, interest rates on both overnight and term instruments had been at low levels. With regard to interest rates on overnight instruments, the uncollateralized call rate had been in the range of 0.075 to 0.080 percent; general collateral (GC) repo rates had been in the range of 0 to 0.1 percent. As for interest rates on term instruments, yields on three-month treasury discount bills (T-Bills) were more or less unchanged.</p>\n",
  "<p>The Tokyo Stock Price Index (TOPIX) had increased in line with U.S. stock prices. Long-term interest rates (10-year JGB yields) had risen, mainly against the background of market participants' views on the future conduct of monetary policy. Many of the liquidity indicators in the JGB markets continued to improve. The diffusion index (DI) for the degree of bond market functioning in the <em>Bond Market Survey</em>, despite remaining negative, continued to improve. In the foreign exchange market, the yen had depreciated against both the U.S. dollar and the euro over the intermeeting period.</p>\n",
  "<h3>C. Overseas Economic and Financial Developments</h3>\n",
  "<p>Overseas economies had grown moderately on the whole. The U.S. economy had grown moderately, mainly led by private consumption, although it had been affected by past policy interest rate hikes by the Federal Reserve. European economies had started to bottom out. The Chinese economy had improved moderately, owing in part to policy support, although it continued to be affected by adjustments in the real estate market. Emerging and commodity-exporting economies other than China had improved moderately on the whole, as signs of a pick-up had been seen in exports.</p>\n",
  "<p>As for the outlook, overseas economies were projected to continue growing moderately. There were high uncertainties regarding the outlook, such as the impact of past policy interest rate hikes by central banks, developments in the Chinese economy, and how geopolitical tensions would unfold.</p>\n",
  "<p>With respect to overseas financial markets, U.S. long-term interest rates had fallen due to lower-than-expected economic indicators and a slower rise in price indicators. European long-term interest rates were more or less unchanged. U.S. stock prices had risen, reflecting the decline in U.S. interest rates and solid corporate results of high-tech firms. Stock prices in Europe had also risen, in line with those in the United States. Meanwhile, currencies in emerging economies had been more or less flat. Crude oil prices had fallen on the back of the decision by OPEC Plus to gradually unwind its oil production cuts and because of an upswing in U.S. crude oil inventories.</p>\n",
  "<h3>D. Economic and Financial Developments in Japan</h3>\n",
  "<h4>1. Economic developments</h4>\n",
  "<p>Japan's economy had recovered moderately, although some weakness had been seen in part. Regarding the outlook, it was likely to keep growing at a pace above its potential growth rate, with overseas economies continuing to grow\n",
  "    moderately and as a virtuous cycle from income to spending gradually intensified against the background of factors such as accommodative financial conditions.</p>\n",
  "<p>Exports had been more or less flat. Regarding the outlook, they were projected to continue showing similar developments for the time being. Thereafter, as overseas economies continued to grow moderately, exports were projected to return to an uptrend, mainly due to a pick-up in global demand for IT-related goods.</p>\n",
  "<p>Industrial production had been more or less flat as a trend, but it continued to be pushed down recently by a suspension of production and shipment at some automakers. Regarding the outlook, industrial production was likely to remain more or less flat for the time being. Thereafter, it was likely to return to an uptrend, reflecting developments in domestic and overseas demand, such as a global pick-up in IT-related goods.</p>\n",
  "<p>Corporate profits had improved. In this situation, business fixed investment had been on a moderate increasing trend. With regard to the outlook, such investment was expected to continue on an increasing trend, mainly on the back of accommodative financial conditions, as corporate profits followed an improving trend.</p>\n",
  "<p>Private consumption had been resilient, although the impact of price rises remained and automobile sales continued to  be pushed down by the suspension of shipment at some automakers. The consumption activity index (CAI; real, travel  balance adjusted) had declined for the January-March quarter of 2024, due to the effects of mild winter weather and  suspension of production and shipment at some automakers. It had then increased slightly for April relative to that  quarter, with a pick-up in automobile sales. Based on anecdotal information from firms and high-frequency  indicators, private consumption since May seemed to have been resilient, although an intensified thriftiness among  households that reflected price rises continued to be pointed out by some firms. While consumer sentiment continued  to improve until recently, it was currently deteriorating somewhat. Regarding the outlook, for the time being,  although private consumption was expected to be affected by price rises, it was projected to increase moderately,  partly due to the effects of the government's economic measures and with nominal employee income continuing to  improve. Thereafter, it was likely to continue increasing moderately as employee income continued to improve.</p>\n",
  "<p>The employment and income situation had improved moderately. Regarding the number of employed persons, that of  regular employees had been on a moderate uptrend, albeit with fluctuations, mainly in the information and  communications industry, which had been facing severe labor shortages. The number of non-regular employees had also  been on a moderate uptrend, albeit with fluctuations. Nominal wages per employee had increased moderately,  reflecting the recovery in economic activity and the results of the 2023 annual spring labor-management wage  negotiations. With regard to the outlook, nominal employee income was likely to continue to see a clear increase in  reflection of an acceleration in nominal wage growth. The year-on-year rate of change in real employee income was  likely to gradually turn positive despite the effects of energy prices.</p>\n",
  "<p>As for prices, commodity prices had risen on the whole. The rate of change in the producer price index (PPI) relative  to three months earlier had been slightly positive recently, as there had been a pass-through to selling prices of  rises in raw material costs and personnel expenses in particular. The year-on-year rate of increase in the services  producer price index (SPPI, excluding international transportation) had accelerated, mainly on the back of the rise  in personnel expenses, and had been in the range of 2.5-3.0 percent recently. The year-on-year rate of increase in  the consumer price index (CPI, all items less fresh food) had been in the range of 2.0-2.5 percent recently, as  services prices continued to rise moderately, reflecting factors such as wage increases, although the effects of the  pass-through to consumer prices of cost increases led by the past rise in import prices had waned. Inflation  expectations had risen moderately. With regard to the outlook for the year-on-year rate of increase in the CPI (all  items less fresh food), while the effects of the pass-through to consumer prices of cost increases led by the past  rise in import prices were expected to wane, the rate of increase was projected to be pushed up through fiscal 2025  by factors such as a waning of the effects of the government's economic measures pushing down CPI inflation.  Meanwhile, underlying CPI inflation was expected to increase gradually, since it was projected that the output gap  would improve and that medium- to long-term inflation expectations would rise with a virtuous cycle between wages  and prices continuing to intensify. In the second half of the projection period of the April 2024 <em>Outlook for  Economic Activity and Prices</em> (Outlook Report), underlying CPI inflation was likely to be at a level that was  generally consistent with the price stability target.</p>\n",
  "<h4>2. Financial environment</h4>\n",
  "<p>Japan's financial conditions had been accommodative.</p>\n",
  "<p>Real interest rates had been negative. Firms' funding costs had increased but remained at low levels. Firms' demand  for funds had increased moderately on the back of, for example, the recovery in economic activity as well as mergers  and acquisitions of firms. With regard to credit supply, financial institutions' lending attitudes as perceived by  firms had been accommodative. Issuance conditions for CP and corporate bonds had been favorable. In this situation,  the year-on-year rate of increase in the amount outstanding of bank lending had been at around 3.5 percent. That in  the aggregate amount outstanding of CP and corporate bonds had been in the range of 1.0-1.5 percent. Firms'  financial positions had been favorable. The number of bankruptcies of firms had increased.</p>\n",
  "<p>Meanwhile, the year-on-year rate of change in the money stock had been at around 2.0 percent.</p>\n",
  "<h2><span aria-hidden=\"true\">II</span><span class=\"txt-hide\">2</span>. Summary of Discussions by the Policy Board on Economic and Financial Developments</h2>\n",
  "<h3>A. Economic and Price Developments</h3>\n",
  "<p>With regard to <strong>global financial and capital markets</strong>, members concurred that market sentiment had improved, reflecting  the fall in U.S. long-term interest rates. A few members noted that exchange rate movements against the U.S. dollar  had tended to be more volatile as market attention had focused on developments in U.S. monetary policy.</p>\n",
  "<p>Members shared the recognition that <strong>overseas economies</strong> had grown moderately on the whole. One member expressed the  view that, albeit with significant differences in degree across countries and regions, overseas economies as a whole  had gradually started to shift away from the phase of monetary tightening, with inflation rates decelerating. One  member was of the view that uncertainties over the outlook for overseas economies had declined. On the other hand, a  few members pointed to the persisting risk of inflation rates rising again, given heightened geopolitical risks such  as increased tension over the situation in the Middle East and growing trade friction between China and other  economies.</p>\n",
  "<p>Members agreed that the U.S. economy had grown moderately, mainly led by private consumption, although it had been  affected by past policy interest rate hikes by the Federal Reserve. Some members expressed the view that the decline  in the U.S. inflation rate remained only moderate to date on the back of firm private consumption. Nevertheless, one  of these members added that the number of economic indicators showing a decelerating trend had recently started to  increase, including indicators of private consumption.</p>\n",
  "<p>Members shared the recognition that European economies had started to bottom out. A few members expressed the view  that signs of improvement had been observed in part, such as in the services industry.</p>\n",
  "<p>Members shared the view that the Chinese economy had improved moderately, owing in part to policy support, although  it continued to be affected by adjustments in the real estate market. Some members noted that, with the economy  facing the problem of excess production, the growing trade friction with advanced economies could push down its  exports.</p>\n",
  "<p>Regarding emerging and commodity-exporting economies other than China, members shared the recognition that these  economies had improved moderately on the whole, as signs of a pick-up had been seen in exports.</p>\n",
  "<p>Based on the above deliberations on economic and financial conditions abroad, members discussed <strong>the state of Japan's  economy</strong>.</p>\n",
  "<p>With regard to <strong>economic activity</strong>, members agreed that Japan's economy had recovered moderately, although some  weakness had been seen in part. One member expressed the view that, although there had been some data showing  relatively weak developments and some information raising concerns since the previous meeting, the virtuous economic  cycle remained intact, being supported from the income side by significantly high levels of corporate profits and by  the highest level of wage growth in around three decades, achieved in the 2024 annual spring labor-management wage  negotiations.</p>\n",
  "<p>As for <strong>the outlook for economic activity</strong>, members shared the recognition that Japan's economy was likely to keep  growing at a pace above its potential growth rate, with overseas economies continuing to grow moderately and as the  virtuous cycle from income to spending gradually intensified against the background of factors such as accommodative  financial conditions. A few members expressed the view that it was highly likely that the suspension of production  and shipment at some automakers would only be a temporary factor pushing down the economy. These members then  pointed out that, with the wide range of supporting industries in Japan's automobile industry, it was necessary to  closely monitor whether the economic cycle would be affected if the effects of the suspension were prolonged.</p>\n",
  "<p>Members shared the recognition that exports had been more or less flat.</p>\n",
  "<p>Members shared the recognition that industrial production had been more or less flat as a trend, but it continued to  be pushed down recently by the suspension of production and shipment at some automakers. One member noted that,  although the effects of additional suspension of production and shipment did not seem to be large at this point, it  was necessary to assess the effects by taking into account reports to be presented at the July 2024 meeting of the  general managers of the Bank's branches.</p>\n",
  "<p>Members agreed that business fixed investment had been on a moderate increasing trend. A few members expressed the  view that investment demand induced by an industrial cluster composed mainly of semiconductor-related firms had  gradually started to be seen. A different member pointed out that, although software investment to address labor  shortages in particular and a reconfiguration of supply chains would likely underpin the increase in business fixed  investment, attention was warranted mainly on the point that, from the viewpoint of the capital stock cycle, it was  suggested that adjustment pressure on business fixed investment might have started to rise. In addition, while  pointing out the recent increase in firms' share buybacks, one member noted that whether firms would allocate their  cash reserves to investment in growth areas warranted attention. Meanwhile, one member noted that small and  medium-sized firms' profitability had been weaker than that of larger firms, which had improved significantly  compared with pre-pandemic levels, and their investment and wage growth had also been low. On this basis, the member  expressed the view that, given certain structural issues in Japan -- such as the declining birthrate and aging  population -- and the decline in its international competitiveness, to realize a virtuous cycle between wages and  prices, it was necessary to create a growth spiral through the following: growth-oriented small, medium-sized, and  larger firms boosting their investment while strengthening their business structures, and startups making great  advancements, so that all these firms attract funds and talent.</p>\n",
  "<p>Members concurred that private consumption had been resilient, although the impact of price rises remained and  automobile sales continued to be pushed down by the suspension of shipment at some automakers. Many members  expressed the recognition that consumption of nondurable goods remained somewhat weak, mainly due to high prices,  and consumer sentiment had recently shown some weakness. As background to the deterioration in consumer sentiment, a  few of these members pointed out that, in addition to rising electricity charges, there had been recognition of the  upside risks to prices reflecting the yen's depreciation. A few members pointed out that, although the effects of  the yen's depreciation varied depending on economic entity, at this point it was necessary to pay further attention  to the negative effects of the depreciation mainly on households' real income and sentiment. One of these members  added that, with rapid movements in foreign exchange rates, progress in economic structural changes had not been  able to keep up with these movements, and it had therefore been difficult for Japan's economy as a whole to receive  the benefits of the yen's depreciation.</p>\n",
  "<p>Some members noted that close attention needed to be paid to the extent to which an improvement in income -- mainly  reflecting wage hikes seen in spring 2024, an upward revision of pensions, and the government's economic measures --  would push up private consumption. In addition, a few members added that, if summer bonuses increased, supported by  favorable business performance, this could also underpin private consumption. In relation to this, some members  expressed the recognition that, with regard to private consumption, it was important to examine household income  more broadly and give due attention to differences between households. One of these members pointed out that,  regarding pensioners and regular employees of small and medium-sized firms, increases in their pensions and wages  might not catch up with the rise in prices for the time being; meanwhile, increases in wages for non-regular  employees and for regular employees of large firms could be expected to be equal to or greater than the rise in  prices. This member then expressed the view that attention was warranted on the effects of these wage developments  on private consumption. Meanwhile, one member pointed out that rises in stock and land prices could affect private  consumption positively through wealth effects.</p>\n",
  "<p>Members shared the view that the employment and income situation had improved moderately. One member expressed the  view that, as suggested by anecdotal information from firms, moves to raise wages seemed to have continued to spread  among small and medium-sized firms, with labor market conditions tightening. The member continued that the  provisional aggregate results of the 2024 wage negotiations compiled by the Japanese Trade Union Confederation  (Rengo) had also revealed relatively high wage increases at small and medium-sized firms.</p>\n",
  "<p>As for <strong>prices</strong>, members agreed that the year-on-year rate of increase in the CPI (all items less fresh food) had been  in the range of 2.0-2.5 percent recently, as services prices continued to rise moderately, reflecting factors such  as wage increases, although the effects of the pass-through to consumer prices of cost increases led by the past  rise in import prices had waned. Many members expressed the view that prices had been developing broadly in line  with the outlook presented in the April 2024 Outlook Report. One member was of the view that, although the virtuous  cycle between wages and prices was developing, underlying inflation had not yet reached 2 percent, taking into  consideration the nominal wage growth rate, inflation expectations, the rate of increase in services prices, and  other factors. In terms of the impact of the rise in import prices, some members pointed out that, although the  effects of the pass-through to consumer prices of cost increases led by the past rise in import prices had waned,  import prices had started to rise again recently, and the effects of this rise had gradually been spreading  downstream. With regard to the effects on services prices of factors such as wage increases, some members pointed to  the acceleration in the rate of increase in the SPPI for April, the start of fiscal 2024. These members then  expressed the view that the pass-through of higher personnel expenses to selling prices in business-to-business  transactions had been spreading. A different member said that the results of the 2024 annual spring labor-management  wage negotiations had not yet been reflected enough in wage statistics; that said, given that the corporate goods  price index (CGPI) and the SPPI had risen, steady progress had been made toward achieving the price stability  target.</p>\n",
  "<p>Members agreed that inflation expectations had risen moderately. A few members pointed out that the monthly  survey-based indicators and the BEI (break-even inflation) rate calculated using inflation-indexed JGBs had risen  steadily. One member expressed the view that the behavior and mindset based on the assumption that wages and prices  would not increase easily had been shifting, as seen in, for example, large firms' moves to factor in rises in wages  and prices as a premise of their medium-term management plans.</p>\n",
  "<p>With regard to the outlook for prices, members agreed that, while the effects of the pass-through to consumer prices  of cost increases led by the past rise in import prices were expected to wane, the year-on-year rate of increase in  the CPI was projected to be pushed up through fiscal 2025 by factors such as the waning of the effects of the  government's economic measures pushing down CPI inflation. Meanwhile, members shared the view that underlying CPI  inflation was expected to increase gradually, since it was projected that the output gap would improve and that  medium- to long-term inflation expectations would rise with the virtuous cycle between wages and prices continuing  to intensify. They continued that, in the second half of the projection period of the April 2024 Outlook Report,  underlying CPI inflation was likely to be at a level that was generally consistent with the price stability target.  One member expressed the view that prices were likely to continue rising, affected by an increase in import prices,  tight labor market conditions, and high shipping costs due to the so-called 2024 problem in Japan's logistics  sector.</p>\n",
  "<p>As for risks to economic activity and prices, members concurred that there remained high uncertainties surrounding  Japan's economic activity and prices, including developments in overseas economic activity and prices, developments  in commodity prices, and domestic firms' wage- and price-setting behavior. Moreover, they shared the view that it  was necessary to pay due attention to developments in financial and foreign exchange markets and their impact on  Japan's economic activity and prices.</p>\n",
  "<p>Members also discussed the risk to prices that the recent depreciation of the yen and other factors would have. Some  members pointed out that, mainly reflecting the recent yen depreciation, import prices had been rising again,  thereby posing an upside risk to prices. In relation to this, one member expressed the view that, at this point, it  was unlikely that the increase in import prices would bring about a significant rise in consumer prices as seen from  2022 onward; that said, price hikes might occur again toward the second half of 2024, since it had become easier for  firms to pass on cost increases to selling prices, partly due to a shift in the social norm of wages and prices not  increasing easily. A different member noted that the yen's depreciation had been effective in pushing up prices  through an expansion in aggregate demand, including inbound tourism demand. This member continued that, even though  price rises stemmed from the cost-push factor, which was the increase in import prices, underlying inflation would  be pushed up if this factor led to higher inflation expectations and wages. On this basis, the member said that, for  the virtuous cycle between wages and prices to intensify steadily amid price rises accompanying the yen's  depreciation, it was important that there be progress in the pass-through of cost increases to selling prices by  small and medium-sized firms and that the nominal wage growth rate increase further. Meanwhile, one member expressed  the view that, since the pass-through of higher personnel expenses to selling prices in business-to-business  transactions had accelerated, there was a risk that such acceleration would also spread to consumer prices.</p>\n",
  "<h3>B. Financial Developments</h3>\n",
  "<p>Members agreed that <strong>financial conditions in Japan</strong> had been accommodative. In addition, they shared the assessment that firms' funding costs had increased but remained at low levels.</p>\n",
  "<h2><span aria-hidden=\"true\">III</span><span class=\"txt-hide\">3</span>. Summary of Discussions on Monetary Policy</h2>\n",
  "<p>Based on the above assessment of economic and financial developments, members discussed monetary policy.</p>\n",
  "<p>With respect to <strong>the guideline for money market operations for the intermeeting period</strong>, members agreed that it was  appropriate for the Bank to maintain the guideline that it would encourage the uncollateralized overnight call rate  to remain at around 0 to 0.1 percent.</p>\n",
  "<p>As for <strong>the future conduct of monetary policy</strong>, members shared the view that, with the price stability target of 2  percent, the Bank would conduct monetary policy as appropriate, in response to developments in economic activity and  prices as well as financial conditions, from the perspective of sustainable and stable achievement of the target. On  this basis, they shared the recognition that, if the outlook for economic activity and prices presented in the April  Outlook Report was realized and underlying inflation increased, the Bank would raise the policy interest rate and  adjust the degree of monetary accommodation. Members continued that, in the case where the outlook for economic  activity and prices deviated upward or upside risks regarding the outlook increased, that would also be an  appropriate reason for the Bank to raise the policy interest rate accordingly.</p>\n",
  "<p>In relation to this, one member pointed out that, while price developments had been in line with the Bank's outlook,  there was a possibility that prices would deviate upward from the baseline scenario if progress was made in the  pass-through to consumer prices of another recent increase in the upward pressure of costs; it was therefore  necessary for the Bank to consider whether further adjustments to the degree of monetary accommodation were needed  from the perspective of risk management. A different member expressed the view that, although prices had been  developing as expected toward achieving the price stability target of 2 percent in the second half of fiscal 2025,  upside risks to prices had become more noticeable. On this basis, the member said that it was necessary for the Bank  to continue to closely monitor relevant data in preparation for the next meeting -- taking into account that the  upside risks to prices had affected consumer sentiment -- and if deemed appropriate, it should raise the policy  interest rate not too late, in response to an increase in the likelihood of achieving the target. In addition, one  member expressed the view that it was appropriate for the Bank to consider any change in the policy interest rate  only after relevant data confirmed that, for example, the CPI inflation rate had clearly started to rebound and  medium- to long-term inflation expectations had risen. On the other hand, one member pointed out that, while private  consumption lacked momentum, there had been successive unexpected suspensions of shipment at some automakers, and  the Bank therefore needed to assess the effects of these factors. The member then expressed the view that it was  appropriate that it continue with the current monetary easing for the time being, thereby encouraging  forward-looking structural reforms by firms.</p>\n",
  "<p>Members also discussed the relationship between the yen's depreciation and the Bank's conduct of monetary policy.  They shared the recognition that the yen's recent depreciation was an upside risk to prices, and the Bank needed to  closely monitor developments when conducting monetary policy. One member pointed out that the depreciation of the  yen increased the risk of an upward revision to the outlook for the inflation rate; given the heightened degree of  the pass-through of the yen's depreciation to domestic prices and the observed inflation rate exceeding 2 percent,  greater losses could be incurred if upside risks to prices materialized. On this basis, the member expressed the  view that, from the standpoint of the risk-management approach, the appropriate, risk-neutral level of the policy  interest rate should rise in reflection of the increased upside risks to prices. A different member commented that  another important factor was the impact that increased expectations for further depreciation of the yen, for  example, would have on corporate behavior and stock prices. One member expressed the recognition that developments  in foreign exchange rates had a wide-ranging impact on economic activity, and if exchange rates continued to deviate  from fundamentals, this would also affect the sound development of the national economy. On this basis, the member  added that, since monetary policy affected not only exchange rates but also wide aspects of people's daily lives and  economic activity, it must be conducted based on the overall picture of developments in economic activity and  prices. A different member expressed the view that, although foreign exchange rates were one of the factors  affecting prices, monetary policy should not be determined by short-term developments in exchange rates, as it was  conducted based on an assessment of the trend in prices and underlying wage developments.</p>\n",
  "<p>Members discussed <strong>the Bank's future JGB purchases</strong>. They shared the recognition that it was appropriate for the Bank  to reduce its purchase amount of JGBs to ensure that long-term interest rates would be formed more freely in  financial markets. In addition, while noting that the Bank's stance of reducing its future purchase amount had  become widely recognized in the JGB market, many members expressed the recognition that speculation over the Bank's  daily JGB purchase operations and the linking of the reduction in the purchase amount with the Bank's stance on its  future policy conduct had been affecting the formation of long-term interest rates. One member expressed the view  that, given the Bank's intention regarding the changes to the policy framework in March 2024, it was necessary to  decrease its presence in the market by reducing its purchase amount of JGBs. A different member noted that issues  remained regarding the side effects of large-scale monetary easing; for example, (1) the Bank had been an  overwhelmingly big player in the JGB market and (2) it had held such a large amount of JGBs that it would be  difficult for other market participants to hold them instead. The member continued that the Bank therefore needed to  normalize its balance sheet in a timely and appropriate manner, while communicating with market participants. One  member pointed out that the purpose of decreasing the size of the Bank's balance sheet was to reduce its increased  involvement in the market without exerting disturbing effects on it, and this should be conducted separately from  monetary policy. A few other members expressed the view that the Bank's basic stance on monetary policy was to  respond to the economic and price situation through guiding the short-term interest rate, and not to regard the  conduct of JGB purchases as an active monetary policy tool. </p>\n",
  "<p>Based on the above recognition, many members expressed the view that it was necessary to enhance the predictability  of the Bank's future JGB purchases, by setting a medium-term plan regarding the reduction of the purchase amount.  Many members noted that, in formulating a reduction plan, it was also important to allow enough flexibility to  support stability in the JGB markets during the reduction process, considering, for example, the Bank's significant  presence in the market. One of these members expressed the view that, given the experience of a smooth exit from the  yield curve control framework, the Bank could determine the appropriate amount, pace, and framework for the  reduction of JGB purchases and reduce the amount outstanding of its JGB holdings without causing market disruption.  In relation to the duration of the reduction plan, many members noted the following: (1) compared with the period  prior to the Bank's introduction of large-scale monetary easing, there had been changes in such factors as financial  regulation and the market environment, and these changes could in turn affect, for example, the long-term structure  of JGB holdings; and (2) discussions on the optimal size of central bank balance sheets in the future were still  underway even at overseas central banks that had been ahead of the Bank in reducing the size of their balance  sheets. Some members expressed the view that, in consideration of these uncertainties, it was appropriate to decide  on a plan with an initial time frame of the next one to two years or so in mind. </p>\n",
  "<p>On this basis, some members pointed out that, in considering the details of the plan for reducing the purchase amount  of JGBs, such as the amount, pace, and framework for the reduction, while taking into account the balance between  predictability and flexibility, it was important for the Bank to attentively collect views from market participants.  In addition, some members expressed the view that, to proceed with the collection of views, it was appropriate that  the Bank decide the guideline for the reduction of its purchase amount at this meeting. One of these members  expressed the view that it was desirable to formulate a medium-term plan -- taking account of supply and demand  conditions and improved functioning in the bond market -- and reduce the amount according to the plan in a  straightforward manner. The member continued that, since it was necessary to set, for example, the optimal pace of  reduction, the Bank should take some time to discuss the plan carefully, including by communicating with market  participants. A few members expressed the recognition that, rather than deciding on a detailed reduction plan at  this meeting, taking steps to collect views from market participants beforehand would enable the Bank to reduce the  purchase amount of JGBs to a greater extent. A different member said that, in formulating the plan, it was  appropriate for the Bank to make a sizable reduction in the purchase amount in a predictable manner, while allowing  enough flexibility to support stability in the JGB markets. </p>\n",
  "<p>Based on the above discussions, most members shared the recognition that the following points were appropriate: (1) regarding <strong>purchases of JGBs, CP, and corporate bonds for the intermeeting period</strong>, the Bank would conduct the  purchases in accordance with the decisions made at the March 2024 meeting; (2) it would decide at this meeting the  guideline for reducing the subsequent purchase amount of JGBs; and (3) it would collect views from market  participants and, at the next meeting, would decide on a detailed plan for the reduction of its purchase amount  during the next one to two years or so. These members shared the view that it was important for the Bank to explain  to the public on occasions such as press conferences its basic stance on JGB purchases, namely, that it was  appropriate to reduce the purchase amount in a predictable manner, while allowing enough flexibility to support  stability in the JGB markets. On the other hand, whilst being in favor of the idea of reducing the Bank's purchase  amount of JGBs, one member expressed the view that the Bank should decide to reduce the amount after reassessing  developments in economic activity and prices in the July 2024 Outlook Report, while communicating with market  participants; this was because, with private consumption lacking momentum, the reduction could push down the  economy, depending on the timing of the start and the scale of the reduction, and therefore warranted careful  examination. Meanwhile, one member expressed the view that, in reducing the purchase amount of JGBs, it was  necessary to discuss a new market structure from a medium- to long-term perspective, bearing in mind what the  structure of JGB holdings should be in the future. The member then said that, in doing so, it was important to  discuss a wide range of issues, including the environment surrounding market participants, such as financial  regulations. </p>\n",
  "<p>Members shared the recognition that the Bank needed to take time to consider <strong>the treatment of its holdings of  exchange-traded funds (ETFs) and Japan real estate investment trusts (J-REITs)</strong>. On this basis, one member expressed  the view that, in order to discuss the treatment of the Bank's ETF holdings, from the viewpoint of the impact ETF  disposals would have on the market, the Bank needed to deepen its understanding of the funds' characteristics -- for  example, that they are not individual stocks but investment trusts.</p>\n",
  "<h2><span aria-hidden=\"true\">IV</span><span class=\"txt-hide\">4</span>. Remarks by Government Representatives</h2>\n",
  "<p>Based on the above discussions, the representative from the Ministry of Finance, with the intent of contacting the Minister of Finance, requested that the chairman adjourn the meeting. The chairman approved the request. (The meeting adjourned at 11:34 a.m. and reconvened at 11:47 a.m.)</p>\n",
  "<p>The representative from the Cabinet Office made the following remarks.</p>\n",
  "<ol class=\"number-en\">\n",
  "    <li>(1) The Japanese economy continued to recover at a moderate pace, although it recently appeared to be pausing. Regarding the outlook, the economy was expected to continue recovering at a moderate pace, while full attention should be given to, for example, wage increases not catching up with the rise in prices and to the impact of the rise in import prices mainly stemming from the yen's depreciation.</li>\n",
  "    <li>(2) While taking all possible measures with regard to current economic management, the government would work, with strong determination, toward reforms that enabled a transition away from an economy oriented toward cost cutting to a growth-oriented economy. The government as a whole would implement a new economic and fiscal plan once it had been formulated.</li>\n",
  "    <li>(3) The government expected the Bank to make appropriate judgements regarding the specifics of monetary policy operations. It also expected the Bank to continue to conduct monetary policy as appropriate toward achieving the price stability target of 2 percent in a sustainable and stable manner while closely cooperating and exchanging views with the government.</li>\n",
  "</ol>\n",
  "<p>The representative from the Ministry of Finance made the following remarks.</p>\n",
  "<ol class=\"number-en\">\n",
  "    <li>(1) Private consumption lacked momentum, although positive developments had been observed in, for example, wage hikes and business fixed investment recently. In addition, the government recognized the risks concerning overseas economies.</li>\n",
  "    <li>(2) The government would make further progress toward achieving both economic revitalization and fiscal consolidation.</li>\n",
  "    <li>(3) The government expected the Bank to conduct monetary policy as appropriate toward sustainable and stable achievement of the price stability target of 2 percent while closely cooperating with the government. Moreover, it expected the Bank to communicate effectively with financial and capital markets, including through its dissemination of information.</li>\n",
  "</ol>\n",
  "<h2><span aria-hidden=\"true\">V</span><span class=\"txt-hide\">5</span>. Votes</h2>\n",
  "<h3>A. Vote on the Guideline for Money Market Operations</h3>\n",
  "    <p>Based on the above discussions, to reflect the view of the members, <strong>the chairman</strong> formulated the following proposal on the guideline for money market operations and put it to a vote.</p>\n",
  "    <p>The Policy Board decided the proposal by a unanimous vote.</p>\n",
  "<p><strong>The Chairman's Policy Proposal on the Guideline for Money Market Operations:</strong></p>\n",
  "<p>The guideline for money market operations for the intermeeting period will be as follows.</p>\n",
  "<div class=\"ml1em\">\n",
  "    <p>The Bank will encourage the uncollateralized overnight call rate to remain at around 0 to 0.1 percent.</p>\n",
  "    <p>Votes for the proposal: UEDA Kazuo, HIMINO Ryozo, UCHIDA Shinichi, ADACHI Seiji, NAKAMURA Toyoaki, NOGUCHI Asahi, NAKAGAWA Junko, TAKATA Hajime, and TAMURA Naoki.</p>\n",
  "    <p>Votes against the proposal: None.</p>\n",
  "</div>\n",
  "<h3>B. Vote on the Guideline for the Purchase of JGBs</h3>\n",
  "    <p>To reflect the majority view of the members, <strong>the chairman</strong> formulated the following proposal on the guideline for JGB purchases and put it to a vote.</p>\n",
  "    <p>The Policy Board decided the proposal by a majority vote.</p>\n",
  "<p><strong>The Chairman's Policy Proposal on the Guideline for the Purchase of JGBs:</strong></p>\n",
  "<p>The guideline for JGB purchases will be as follows.</p>\n",
  "<div class=\"ml1em\">\n",
  "    <ol>\n",
  "        <li>Regarding purchases of JGBs for the intermeeting period, the Bank will conduct the purchases in accordance with the decisions made at the March 2024 Monetary Policy Meeting.</li>\n",
  "        <li>The Bank will reduce its purchase amount of JGBs thereafter to ensure that long-term interest rates will be formed more freely in financial markets. It will collect views from market participants and, at the next Monetary Policy Meeting, will decide on a detailed plan for the reduction of its purchase amount during the next one to two years or so.</li>\n",
  "    </ol>\n",
  "    <p>Votes for the proposal: UEDA Kazuo, HIMINO Ryozo, UCHIDA Shinichi, ADACHI Seiji, NOGUCHI Asahi, NAKAGAWA Junko, TAKATA Hajime, and TAMURA Naoki.</p>\n",
  "    <p>Votes against the proposal: NAKAMURA Toyoaki.</p>\n",
  "<p>While <strong>Nakamura Toyoaki</strong> was in favor of the idea of reducing the Bank's purchase amount of JGBs, he dissented, considering that the Bank should decide to reduce it after reassessing developments in economic activity and prices in the July 2024 Outlook Report.</p>\n",
  "</div>\n",
  "<h3>C. Discussion on the Statement on Monetary Policy</h3>\n",
  "<p><strong>The chairman</strong> formulated the Statement on Monetary Policy and put it to a vote. The Policy Board decided the text by a unanimous vote. It was confirmed that the statement would be released immediately after the meeting (see Attachment).</p>\n",
  "<h2><span aria-hidden=\"true\">VI</span><span class=\"txt-hide\">6</span>. Approval of the Minutes of the Monetary Policy Meeting</h2>\n",
  "<p>The Policy Board approved unanimously the minutes of the Monetary Policy Meeting of April 25 and 26, 2024, for release on June 19.</p>\n",
  "<hr>\n",
  "<ol class=\"red-number\">\n",
  "\t<li id=\"fn1\">The minutes of this meeting were approved by the Policy Board at the Monetary Policy Meeting held on July 30 and 31, 2024, as \"a document describing an outline of the discussion at the meeting\" stipulated in Article 20, paragraph 1 of the Bank of Japan Act of 1997. Those present are referred to by their titles at the time of the meeting.<a href=\"#p1\" title=\"Return1\"> Return to text </a></li>\n",
  "\t\t<li id=\"fn2\">Present on June 14.<a href=\"#p2\" title=\"Return2\"> Return to text </a></li>\n",
  "\t\t<li id=\"fn3\">Present on June 13.<a href=\"#p3\" title=\"Return3\"> Return to text </a></li>\n",
  "\t\t<li id=\"fn4\">Present on June 14 from 11:01 a.m. to 12:16 p.m.<a href=\"#p4\" title=\"Return4\"> Return to text </a></li>\n",
  "\t\t<li id=\"fn5\">Present on June 14 from 9:00 a.m. to 11:00 a.m.<a href=\"#p5\" title=\"Return5\"> Return to text </a></li>\n",
  "\t\t<li id=\"fn6\">Reports were made based on information available at the time of the meeting.<a href=\"#p6\" title=\"Return6\"> Return to text </a></li>\n",
  "\t\t<li id=\"fn7\">The guideline was as follows:<p class=\"ml2em mt0 mb0\">The Bank will encourage the uncollateralized overnight call rate to remain at around 0 to 0.1 percent.<a href=\"#p7\" title=\"Return7\"> Return to text </a></p></li>\n",
  "</ol>\n",
  "<hr class=\"double\">\n",
  "<p id=\"attach\">Attachment</p>\n",
  "<p>June 14, 2024<br>\n",
  "    Bank of Japan</p>\n",
  "<h2>Statement on Monetary Policy</h2>\n",
  "<ol>\n",
  "<li>At the Monetary Policy Meeting (MPM) held today, the Policy Board of the Bank of Japan decided, by a unanimous vote,\n",
  "    to set the following guideline for money market operations for the intermeeting period:\n",
  "<div class=\"ml2em\">\n",
  "<p>The Bank will encourage the uncollateralized overnight call rate to remain at around 0 to 0.1 percent.</p>\n",
  "</div>\n",
  "<p>Regarding purchases of Japanese government bonds (JGBs), CP, and corporate bonds for the intermeeting period, the Bank will conduct the purchases in accordance with the decisions made at the March 2024 MPM. The Bank decided, by an 8-1 majority vote, that it would reduce its purchase amount of JGBs thereafter to ensure that long-term interest rates would be formed more freely in financial markets.<sup><a href=\"#note01\" id=\"nt01\" class=\"red\">[Note]</a></sup> It will collect views from market participants and, at the next MPM, will decide on a detailed plan for the reduction of its purchase amount during the next one to two years or so.</p></li>\n",
  "<li>Japan's economy has recovered moderately, although some weakness has been seen in part. Overseas economies have grown moderately on the whole. Exports have been more or less flat. Industrial production has been more or less flat as a trend, but it has continued to be pushed down recently by a suspension of production and shipment at some automakers. With corporate profits improving, business fixed investment has been on a moderate increasing trend. The employment and income situation has improved moderately. Private consumption has been resilient, although the impact of price rises has remained and automobile sales have continued to be pushed down by the suspension of shipment at some automakers. Housing investment has been relatively weak. Public investment has been more or less flat. Financial conditions have been accommodative. On the price front, the year-on-year rate of increase in the consumer price index (CPI, all items less fresh food) has been in the range of 2.0-2.5 percent recently, as services prices have continued to rise moderately, reflecting factors such as wage increases, although the effects of a pass-through to consumer prices of cost increases led by the past rise in import prices have waned. Inflation expectations have risen moderately.\n",
  "<p>Japan's economy is likely to keep growing at a pace above its potential growth rate, with overseas economies continuing to grow moderately and as a virtuous cycle from income to spending gradually intensifies against the background of factors such as accommodative financial conditions. While the effects of the pass-through to consumer prices of cost increases led by the past rise in import prices are expected to wane, the year-on-year rate of increase in the CPI (all items less fresh food) is projected to be pushed up through fiscal 2025 by factors such as a waning of the effects of the government's economic measures pushing down CPI inflation. Meanwhile, underlying CPI inflation is expected to increase gradually, since it is projected that the output gap will improve and that medium- to long-term inflation expectations will rise with a virtuous cycle between wages and prices continuing to intensify. In the second half of the projection period of the April 2024 <em>Outlook for Economic Activity and Prices</em> (Outlook Report), it is likely to be at a level that is generally consistent with the price stability target.</p>\n",
  "<p>Concerning risks to the outlook, there remain high uncertainties surrounding Japan's economic activity and prices, including developments in overseas economic activity and prices, developments in commodity prices, and domestic firms' wage- and price-setting behavior. Under these circumstances, it is necessary to pay due attention to developments in financial and foreign exchange markets and their impact on Japan's economic activity and prices.</p></li>\n",
  "</ol>\n",
  "<hr> \n",
  "<ol class=\"no-list indent3\">\n",
  "\t<li id=\"note01\"><span class=\"red\">[Note]</span> Voting for the action: UEDA Kazuo, HIMINO Ryozo, UCHIDA Shinichi, ADACHI Seiji, NOGUCHI Asahi, NAKAGAWA Junko,TAKATA Hajime, and TAMURA Naoki. Voting against the action: NAKAMURA Toyoaki. While Nakamura Toyoaki was in favor of the idea of reducing the Bank's purchase amount of JGBs, he dissented, considering that the Bank should decide to reduce it after reassessing developments in economic activity and prices in the July 2024 Outlook Report.<a href=\"#nt01\" title=\"Return nt01\">Return to text</a></li>\n",
  "</ol><!-- [END] CONTENT_2 -->\r\n",
  "      </div>\r\n",
  "      <!-- ▲▲　コンテンツ　▲▲-->\r\n",
  "    </main>",
].join("");
const officialDigest = "391cc09636deb3e1064169393343209dbf753c743abef97e1fbd93fa58b80f1c";
const url = "https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2024/g240614.htm";
const previous = "The Bank had been conducting money market operations in accordance with the guideline for money market operations decided at the previous meeting on April 25 and 26, 2024.";
const observed = "The uncollateralized overnight call rate had been in the range of 0.076 to 0.078 percent.";
const guideline = "The Bank will encourage the uncollateralized overnight call rate to remain at around 0 to 0.1 percent.";
function fixture(html = officialMain) { return { sourceUrl: url, documentKind: "mpm-minutes-english-html", html }; }
function change(before: string, after: string): string {
  assert.ok(officialMain.includes(before), "mutation target must exist");
  assert.notEqual(before, after);
  const altered = officialMain.replace(before, after);
  assert.notEqual(altered, officialMain);
  return altered;
}
function reject(input: unknown, code: string): void {
  assert.throws(() => parse(input), { name: "TypeError", message: "BoJ continuity V1: " + code + "." });
}
function frozenTree(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value));
  for (const d of Object.values(Object.getOwnPropertyDescriptors(value))) frozenTree(d.value);
}

test("unchanged official fixture preserves explicit meeting reference and separate canonical mapping", () => {
  assert.equal(createHash("sha256").update(officialMain, "utf8").digest("hex"), officialDigest);
  const result = parse(fixture());
  assert.equal(result.schemaVersion, "boj-decision-continuity-source-evidence-v1");
  assert.equal(result.parserQualificationVersion, "boj-june-2024-minutes-explicit-reference-v1");
  assert.equal(result.semantic, "source-fact-description");
  assert.deepEqual(result.currentMeeting, { startDate: "2024-06-13", endDate: "2024-06-14" });
  assert.deepEqual(result.referencedPreviousMeeting, { startDate: "2024-04-25", endDate: "2024-04-26" });
  assert.deepEqual(result.canonicalMapping, { semantic: "qualified-meeting-end-date-mapping",
    currentDecisionId: "japan-boj-policy-decision:2024-06-14", referencedDecisionId: "japan-boj-policy-decision:2024-04-26" });
  assert.equal(result.relationship, "source-stated-previous-meeting");
  assert.equal(result.instrument, "uncollateralized-overnight-call-rate-guideline");
  assert.deepEqual(result.referencedGuideline, { shape: "range", lower: 0, upper: 0.1, qualification: "around", unit: "percent" });
  assert.deepEqual(result.evidenceReference, { section: "I.A", footnote: "7", relationshipText: previous, guidelineText: guideline });
  assert.equal(result.source.publisher, "Bank of Japan");
  assert.equal(result.source.host, "www.boj.or.jp");
  assert.equal(result.source.url, url);
  assert.equal(result.source.documentKind, "mpm-minutes-english-html");
  assert.equal(result.source.documentId, "BOJ:mpm-minutes:2024-06-13:2024-06-14:en");
  assert.deepEqual(result.source.documentDigest, { algorithm: "sha256", representation: "caller-supplied-decoded-html-utf8", value: officialDigest });
  assert.deepEqual(result.source.publication, { semantic: "source-stated-publication-date", date: "2024-08-05" });
  assert.deepEqual(result.provenance, { basis: "parsed-caller-supplied-document", acquisitionTrust: "not-established", officialSuccessionVerification: "not-performed" });
  frozenTree(result);
});

test("observed rates and March bond references do not substitute for selected guideline or meeting", () => {
  const result = parse(fixture());
  assert.ok(officialMain.includes("decisions made at the March 2024 meeting"));
  assert.ok(officialMain.includes(observed));
  assert.equal(result.referencedGuideline.upper, 0.1);
  assert.equal(result.referencedPreviousMeeting.endDate, "2024-04-26");
  assert.ok(!JSON.stringify(result).includes("0.078"));
});

const mutations: readonly [string, string, string, string][] = [
  ["missing explicit relationship", previous, "", "reference"],
  ["calendar proximity only", previous, "Meetings were held on April 25 and 26, 2024.", "reference"],
  ["framework reference", previous, "The framework introduced at the March 2024 meeting continued.", "reference"],
  ["observed rates only", previous, observed, "reference"],
  ["wrong reference instrument", "guideline for money market operations decided at the previous", "guideline for JGB purchases decided at the previous", "reference"],
  ["wrong previous meeting", "previous meeting on April 25 and 26, 2024", "previous meeting on March 18 and 19, 2024", "reference"],
  ["malformed previous date", "previous meeting on April 25 and 26, 2024", "previous meeting on April 30 and 31, 2024", "reference"],
  ["wrong current title", "on June 13 and 14, 2024</span>", "on July 30 and 31, 2024</span>", "context"],
  ["unsupported document title", "Minutes of the\nMonetary Policy Meeting", "Summary of Opinions at the\nMonetary Policy Meeting", "context"],
  ["wrong current meeting body", "Thursday, June 13, 2024", "Thursday, June 20, 2024", "context"],
  ["wrong publisher", "August 5, 2024<br>\nBank of Japan", "August 5, 2024<br>\nAnother Bank", "source"],
  ["changed publication date", "August 5, 2024<br>", "June 14, 2024<br>", "source"],
  ["unzoned publication clock", "August 5, 2024<br>", "August 5, 2024 at 8:50<br>", "source"],
  ["wrong PDF identity", "g240614.pdf", "g240426.pdf", "document"],
  ["wrong section", "A. Market Operations in the Intermeeting Period", "A. Historical Framework Review", "reference"],
  ["wrong footnote link", 'href="#fn7" id="p7"', 'href="#fn6" id="p7"', "reference"],
  ["wrong footnote setting", 'class="ml2em mt0 mb0">' + guideline, 'class="ml2em mt0 mb0">' + observed, "guideline"],
  ["wrong footnote instrument", 'class="ml2em mt0 mb0">' + guideline, 'class="ml2em mt0 mb0">The Bank will encourage the basic loan rate to remain at around 0 to 0.1 percent.', "guideline"],
  ["footnote scalar substitution", 'class="ml2em mt0 mb0">' + guideline, 'class="ml2em mt0 mb0">The Bank will encourage the uncollateralized overnight call rate to remain at around 0.1 percent.', "guideline"],
  ["footnote loses around", 'class="ml2em mt0 mb0">' + guideline, 'class="ml2em mt0 mb0">' + guideline.replace("around ", ""), "guideline"],
  ["current guideline conflict", '<div class="ml1em">\n    <p>' + guideline, '<div class="ml1em">\n    <p>' + guideline.replace("0 to 0.1", "0.25"), "guideline"],
  ["missing vote decision", "The Policy Board decided the proposal by a unanimous vote.", "The members discussed the proposal.", "guideline"],
  ["attachment date conflict", "June 14, 2024<br>\n    Bank of Japan", "April 26, 2024<br>\n    Bank of Japan", "context"],
  ["attachment loses set decision", "to set the following guideline", "to describe the following guideline", "guideline"],
  ["hidden selected paragraph", "<p>" + previous, '<p hidden="hidden">' + previous, "document"],
  ["aria hidden selected paragraph", "<p>" + previous, '<p aria-hidden="true">' + previous, "document"],
  ["CSS hiding", "<p>" + previous, '<p style="display:none">' + previous, "document"],
  ["hidden class", "<p>" + previous, '<p class="txt-hide">' + previous, "document"],
  ["unknown source markup", "<p>" + previous, "<section>" + previous, "document"],
  ["misleading return link", 'title="Return7"> Return to text', 'title="Return7"> A different predecessor', "document"],
  ["footnote superscript text injection", ">7</a></sup> " + observed, ">7</a>March was the previous meeting</sup> " + observed, "document"],
  ["commented evidence", "<p>" + previous, "<!-- <p>" + previous, "document"],
  ["CDATA", "<p>" + previous, "<p><![CDATA[" + previous, "document"],
  ["wrong main identity", '<main id="contents">', '<main id="elsewhere">', "document"],
  ["unsupported wrapper", '<div class="outline mod_outer">', '<div class="other-layout">', "document"],
  ["duplicate content marker", "<!-- [START] CONTENT_2 -->", "<!-- [START] CONTENT_2 --><!-- [START] CONTENT_2 -->", "document"],
  ["body is not markup", "<!-- [START] CONTENT_2 -->", "<!-- [START] CONTENT_2 -->unqualified text", "document"],
];
for (const [label, before, after, code] of mutations) test("rejects " + label, () => reject(fixture(change(before, after)), code));

for (const [label, addition] of [
  ["duplicate explicit reference", previous],
  ["conflicting dated reference", previous.replace("April 25 and 26", "March 18 and 19")],
  ["conflicting preceding reference", "The preceding meeting for the overnight call-rate guideline was in March 2024."],
  ["conflicting prior reference", "The prior policy meeting set a different guideline."],
] as const) test("rejects " + label, () => {
  reject(fixture(change("<h3>B. Recent Developments in Financial Markets</h3>",
    "<h3>B. Recent Developments in Financial Markets</h3><p>" + addition + "</p>")), "reference");
});

test("rejects missing footnote, duplicate footnote, malformed markup and duplicate main", () => {
  reject(fixture(change('id="fn7"', 'id="fn6"')), "document");
  reject(fixture(change('id="p7"', 'id="p6"')), "document");
  reject(fixture(change("</main>", "</main><main id=\"contents\"></main>")), "document");
  reject(fixture(change("</h3>", "</h4>")), "document");
});

for (const sourceUrl of [url + "?q=1", url + "#fn7", url.replace("www.", ""), url.replace("https:", "http:"),
  url.replace("g240614", "g240426"), url.replace("2024", "2025"), "https://www.boj.or.jp.evil.example/en/mopo/mpmsche_minu/minu_2024/g240614.htm",
  url.replace("www.boj.or.jp", "user@www.boj.or.jp"), url.replace("www.boj.or.jp", "www.boj.or.jp:443"),
]) test("rejects unsupported URL " + sourceUrl, () => reject({ ...fixture(), sourceUrl }, "source"));

for (const documentKind of ["statement", "mpm-summary", "mpm-minutes-pdf", "", null, {}]) {
  test("rejects unsupported kind " + String(documentKind), () => reject({ ...fixture(), documentKind }, "source"));
}
for (const value of [null, undefined, true, 1, "html", [], new Date(0), new Map()]) {
  test("rejects non-record input " + String(value), () => reject(value, "input"));
}
for (const html of [null, undefined, {}, new String(officialMain), 1, "\uD800"]) {
  test("rejects malformed HTML " + typeof html, () => reject({ ...fixture(), html }, "document"));
}

for (const field of ["sourceUrl", "documentKind", "html"]) {
  test("rejects missing " + field, () => { const input: Record<string, unknown> = fixture(); delete input[field]; reject(input, "input"); });
  test("rejects non-enumerable required " + field, () => {
    const input = fixture(); Object.defineProperty(input, field, { enumerable: false }); reject(input, "input");
  });
  for (const mode of ["getter", "setter", "both"] as const) test("rejects " + mode + " " + field + " without executing caller code", () => {
    let calls = 0; const input = fixture();
    Object.defineProperty(input, field, { enumerable: true,
      ...(mode !== "setter" ? { get() { calls++; throw new Error("caller getter"); } } : {}),
      ...(mode !== "getter" ? { set() { calls++; throw new Error("caller setter"); } } : {}) });
    reject(input, "input"); assert.equal(calls, 0);
  });
}
for (const mode of ["enumerable", "hidden", "symbol"] as const) test("rejects " + mode + " extra", () => {
  const input = fixture(); Object.defineProperty(input, mode === "symbol" ? Symbol("extra") : "extra",
    { value: 1, enumerable: mode === "enumerable" }); reject(input, "input");
});
for (const key of ["knownAt", "evaluatedAt", "knowledgeCutoff", "capture", "receipt", "verified", "canonicalMapping", "diagnostics"]) {
  test("rejects caller-supplied " + key, () => reject({ ...fixture(), [key]: {} }, "input"));
}
test("rejects unknown accessors and custom/proxy prototypes without execution", () => {
  let calls = 0; const denied = () => { calls++; throw new Error("caller trap"); };
  const input = fixture(); Object.defineProperty(input, "extra", { get: denied, enumerable: true }); reject(input, "input");
  const inherited = Object.create({ get html() { return denied(); } }); reject(inherited, "input");
  const proxyPrototype = new Proxy({}, { get: denied, getPrototypeOf: denied, ownKeys: denied });
  reject(Object.assign(Object.create(proxyPrototype), fixture()), "input");
  assert.equal(calls, 0);
});
test("rejects live and revoked proxies before any trap, including primitive-field substitution", () => {
  let calls = 0; const denied = () => { calls++; throw new Error("caller trap"); };
  const proxy = new Proxy(fixture(), { get: denied, ownKeys: denied, getOwnPropertyDescriptor: denied,
    getPrototypeOf: denied, has: denied, set: denied });
  reject(proxy, "input");
  const revocable = Proxy.revocable(fixture(), {}); revocable.revoke(); reject(revocable.proxy, "input");
  reject({ ...fixture(), html: proxy }, "document");
  reject({ ...fixture(), sourceUrl: proxy }, "source");
  reject({ ...fixture(), documentKind: proxy }, "source");
  assert.equal(calls, 0);
});

test("accepts frozen and null-prototype records; output is detached, deeply frozen and repeatable", () => {
  const input = fixture(); const result = parse(input);
  assert.deepEqual(parse(Object.freeze(fixture())), result);
  assert.deepEqual(parse(Object.assign(Object.create(null), fixture())), result);
  assert.deepEqual(parse(input), result);
  assert.notStrictEqual(parse(input), result);
  input.sourceUrl = "changed"; input.html = ""; input.documentKind = "changed";
  assert.equal(result.source.url, url); assert.equal(result.source.documentDigest.value, officialDigest);
  assert.equal(Reflect.set(result.currentMeeting, "endDate", "2024-07-31"), false);
  frozenTree(result);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("digest binds the whole unchanged decoded input representation, including outer whitespace", () => {
  const padded = "\n" + officialMain + "\n";
  const result = parse(fixture(padded));
  assert.equal(result.source.documentDigest.value, createHash("sha256").update(padded, "utf8").digest("hex"));
  assert.notEqual(result.source.documentDigest.value, officialDigest);
  assert.deepEqual(result.evidenceReference, parse(fixture()).evidenceReference);
});

test("closed runtime API issues source descriptions only; descriptions and copies are not trusted receipts", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "BOJ_DECISION_CONTINUITY_EVIDENCE_SCHEMA_VERSION_V1", "BOJ_DECISION_CONTINUITY_PARSER_QUALIFICATION_V1",
    "parseBojDecisionContinuityEvidenceV1",
  ].sort());
  const result = parse(fixture());
  for (const receipt of [result, structuredClone(result), { ...result, status: "verified" }]) {
    assert.throws(() => readBojPolicyDecisionCaptureAsKnownAtV1({
      receipt: receipt as never, evaluatedAt: "2024-06-14T00:00:00Z",
    }), { name: "TypeError", message: "Unrecognized BoJ decision capture receipt." });
  }
  const unavailable = buildUnavailableOfficialPolicyPredecessorProofV1({
    provider: "boj", requestedCurrentDecision: { kind: "policy-series", canonicalSeriesId: result.canonicalMapping.currentDecisionId },
    evaluatedAt: "2024-06-14T00:00:00.999Z", knowledgeCutoff: 0,
    unavailableReason: "TRUSTED_ACQUISITION_PROVENANCE_UNAVAILABLE", comparisonUnavailableReason: "OFFICIAL_PREDECESSOR_UNAVAILABLE",
  });
  assert.equal(unavailable.officialPredecessor.status, "unavailable");
  assert.equal(unavailable.officialPredecessor.reasonBasis, "caller-declared-diagnostic");
});

test("publication stays source-stated data; no acquisition, historical knowledge or comparison claims", () => {
  const result = parse(fixture());
  const forbidden = new Set(["knownAt", "fetchedAt", "evaluatedAt", "knowledgeCutoff", "releaseTimestamp",
    "receipt", "capability", "verified", "officialPredecessor", "revisionId", "action", "direction",
    "change", "delta", "fxImpact", "productionReady"]);
  function visit(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { assert.ok(!forbidden.has(key), key); visit(child); }
  }
  visit(result);
  assert.deepEqual(result.source.publication, { semantic: "source-stated-publication-date", date: "2024-08-05" });
  assert.equal(result.provenance.acquisitionTrust, "not-established");
  assert.equal(result.provenance.officialSuccessionVerification, "not-performed");
});

test("fresh import and parsing execute no clocks, network, environment, filesystem or scheduler calls", () => {
  const script = String.raw`
    const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),Module=require('node:module');
    const allowed={'node:crypto':require('node:crypto'),'node:util':require('node:util'),'fast-xml-parser':require('fast-xml-parser'),'server-only':{}};
    const filename=path.resolve('src/lib/markets/providers/boj/decisionContinuityEvidence.ts');
    const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
    const input=JSON.parse(fs.readFileSync(0,'utf8'));
    let calls=0; const denied=()=>{calls++;throw Error('forbidden side effect');};
    const restore=[]; const patch=(o,k,v)=>{const d=Object.getOwnPropertyDescriptor(o,k);Object.defineProperty(o,k,{configurable:true,writable:true,value:v});restore.push(()=>d?Object.defineProperty(o,k,d):delete o[k]);};
    patch(Date,'now',denied);
    for(const k of ['fetch','setTimeout','setInterval','setImmediate','queueMicrotask'])patch(globalThis,k,denied);
    for(const k of ['readFileSync','writeFileSync','appendFileSync','openSync','statSync','mkdirSync','rmSync'])patch(fs,k,denied);
    for(const k of ['readFile','writeFile','appendFile','open','stat','mkdir','rm'])patch(fs.promises,k,denied);
    patch(process,'env',new Proxy({},{get:denied,ownKeys:denied,set:denied,getOwnPropertyDescriptor:denied}));
    patch(Module,'_load',id=>{if(Object.hasOwn(allowed,id))return allowed[id];throw Error('unexpected import '+id);});
    let result;try{const m=new Module(filename);m.filename=filename;m._compile(code,filename);result=m.exports.parseBojDecisionContinuityEvidenceV1(input);}finally{for(const f of restore.reverse())f();}
    if(calls!==0||result.provenance.acquisitionTrust!=='not-established')throw Error('side effect or trust claim');
    process.stdout.write('PURE_SOURCE_FACT_ONLY');
  `;
  const result = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), encoding: "utf8",
    input: JSON.stringify(fixture()), timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.equal(result.stdout, "PURE_SOURCE_FACT_ONLY");
});

test("module contains no authority, acquisition or runtime wiring imports", () => {
  const source = readFileSync(path.resolve("src/lib/markets/providers/boj/decisionContinuityEvidence.ts"), "utf8");
  const imports = [...source.matchAll(/^import\s+(?:[^\n]*?\s+from\s+)?"([^"]+)";/gm)].map(m => m[1]);
  assert.deepEqual(imports, ["server-only", "node:crypto", "node:util", "fast-xml-parser"]);
});

test("missing or displaced footnote cannot borrow the current policy context", () => {
  const footnote = officialMain.match(/<li id="fn7">[\s\S]*?<\/li>/)?.[0];
  assert.ok(footnote);
  reject(fixture(change(footnote, "")), "guideline");
  reject(fixture(change('href="#p7" title="Return7"', 'href="#p6" title="Return7"')), "guideline");
});
for (const [label, before, after, code] of [
  ["inline wrapper substitution", previous, "<em>" + previous + "</em>", "reference"],
  ["extra evidence class", "<p>" + previous, '<p class="ml2em">' + previous, "reference"],
  ["script insertion", "<h3>B. Recent Developments in Financial Markets</h3>", "<h3>B. Recent Developments in Financial Markets</h3><script>void 0</script>", "document"],
  ["additional guideline", "<h3>B. Recent Developments in Financial Markets</h3>", "<h3>B. Recent Developments in Financial Markets</h3><p>" + guideline + "</p>", "guideline"],
  ["missing current guideline section", ". Votes</h2>", ". Discussions</h2>", "guideline"],
  ["commented-out whole main", officialMain, "<!--" + officialMain + "-->", "document"],
] as const) test("rejects " + label, () => reject(fixture(change(before, after)), code));

for (const element of ["li", "div", "h4"]) test("rejects conflicting reference in " + element, () => {
  reject(fixture(change("<h3>B. Recent Developments in Financial Markets</h3>",
    "<h3>B. Recent Developments in Financial Markets</h3><" + element + ">The preceding meeting was in March 2024.</" + element + ">")), "reference");
});
test("revoked proxies in scalar fields and coercible objects execute no caller code", () => {
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  reject({ ...fixture(), html: revoked.proxy }, "document");
  reject({ ...fixture(), sourceUrl: revoked.proxy }, "source");
  let calls = 0;
  const fakeString = { toString() { calls++; return officialMain; }, [Symbol.toPrimitive]() { calls++; return officialMain; } };
  reject({ ...fixture(), html: fakeString }, "document");
  reject({ ...fixture(), sourceUrl: fakeString }, "source");
  assert.equal(calls, 0);
});

for (const [label, prefix, suffix] of [
  ["template", "<template>", "</template>"],
  ["inert script", '<script type="text/plain">', "</script>"],
  ["hidden div", "<div hidden>", "</div>"],
  ["unrelated div", "<div>", "</div>"],
  ["HTML page", "<html><body>", "</body></html>"],
  ["full HTML page", "<!DOCTYPE html><html><head><title>Minutes</title></head><body>", "</body></html>"],
  ["outer comment", "<!-- unrelated -->", ""],
  ["preceding markup", "<p>Unrelated</p>", ""],
  ["trailing markup", "", "<p>Unrelated</p>"],
  ["outer text", "Unrelated", ""],
] as const) test("rejects unsupported outer context: " + label, () => {
  reject(fixture(prefix + officialMain + suffix), "document");
});

const conflictingAliases = [
  "The previous MPM for the overnight call-rate guideline was held on May 1, 2024.",
  "The immediately preceding Monetary Policy Meeting for the overnight call-rate guideline was held on May 1, 2024.",
  "The prior monetary policy meeting set a different guideline.",
  "The earlier MPM set a different guideline.",
  "The last MONETARY POLICY MEETING set a different guideline.",
  "The previous\n\tMonetary Policy Meeting set a different guideline.",
] as const;
for (const [index, addition] of conflictingAliases.entries()) {
  for (const element of ["p", "li", "div", "h4"]) test("rejects predecessor alias " + index + " in " + element, () => {
    const anchor = "<h3>B. Recent Developments in Financial Markets</h3>";
    reject(fixture(change(anchor, anchor + "<" + element + ">" + addition + "</" + element + ">")), "reference");
  });
}
for (const [index, addition] of conflictingAliases.slice(0, 2).entries()) {
  test("rejects predecessor alias " + index + " in a later content block", () => {
    reject(fixture(change("<!-- [END] CONTENT_2 -->", "<p>" + addition + "</p><!-- [END] CONTENT_2 -->")), "reference");
  });
}
for (const alias of ["previous MPM", "previous Monetary Policy Meeting"]) {
  test("does not positively qualify a substituted relationship using " + alias, () => {
    reject(fixture(change("previous meeting on April 25 and 26, 2024", alias + " on April 25 and 26, 2024")), "reference");
  });
}
test("preserves qualified economic commentary and accepts ordinary non-predecessor meeting commentary", () => {
  const anchor = "<h3>B. Recent Developments in Financial Markets</h3>";
  const html = change(anchor, anchor +
    "<p>Members discussed economic activity at the MPM and the Monetary Policy Meeting. The next MPM would address the outlook.</p>");
  assert.ok(html.replace(/\s+/g, " ").includes("since the previous meeting, the virtuous economic cycle remained intact"));
  const result = parse(fixture(html));
  assert.deepEqual(result.evidenceReference, parse(fixture()).evidenceReference);
  assert.equal(result.canonicalMapping.referencedDecisionId, "japan-boj-policy-decision:2024-04-26");
});

const documentSizeLimit = 2 * 1024 * 1024;
const officialByteLength = Buffer.byteLength(officialMain, "utf8");
const utf8Overhead = officialByteLength - officialMain.length;

// The unchanged source has 108 more UTF-8 bytes than UTF-16 code units.
// Equal ceilings therefore prevent accepting this fixture at the character ceiling.
test("accepts the closest attainable character boundary at the UTF-8 byte limit", () => {
  assert.equal(utf8Overhead, 108);
  const html = " ".repeat(documentSizeLimit - officialByteLength) + officialMain;
  assert.equal(html.length, documentSizeLimit - 108);
  assert.equal(Buffer.byteLength(html, "utf8"), documentSizeLimit);
  const result = parse(fixture(html));
  assert.deepEqual(result.evidenceReference, parse(fixture()).evidenceReference);
  assert.equal(result.source.documentDigest.value, createHash("sha256").update(html, "utf8").digest("hex"));
});

test("accepts valid fixture padding one byte below the UTF-8 limit", () => {
  const html = officialMain + " ".repeat(documentSizeLimit - 1 - officialByteLength);
  assert.equal(html.length, documentSizeLimit - 109);
  assert.equal(Buffer.byteLength(html, "utf8"), documentSizeLimit - 1);
  assert.equal(parse(fixture(html)).canonicalMapping.currentDecisionId, "japan-boj-policy-decision:2024-06-14");
});

test("rejects fixture padding at the character ceiling because its bytes exceed the byte ceiling", () => {
  const html = " ".repeat(documentSizeLimit - officialMain.length) + officialMain;
  assert.equal(html.length, documentSizeLimit);
  assert.equal(Buffer.byteLength(html, "utf8"), documentSizeLimit + 108);
  reject(fixture(html), "document");
});

test("rejects one character above the limit before UTF-8 encoding", () => {
  const html = " ".repeat(documentSizeLimit + 1 - officialMain.length) + officialMain;
  assert.equal(html.length, documentSizeLimit + 1);
  assert.equal(Buffer.byteLength(html, "utf8"), documentSizeLimit + 109);
  const originalByteLength = Buffer.byteLength;
  let byteLengthCalls = 0;
  Buffer.byteLength = (...args: Parameters<typeof Buffer.byteLength>) => {
    byteLengthCalls++;
    return originalByteLength(...args);
  };
  try {
    reject(fixture(html), "document");
    assert.equal(byteLengthCalls, 0, "character preflight must reject before UTF-8 encoding");
  } finally {
    Buffer.byteLength = originalByteLength;
  }
});

test("rejects valid ASCII padding one byte above the UTF-8 limit while within the character limit", () => {
  const html = officialMain + " ".repeat(documentSizeLimit + 1 - officialByteLength);
  assert.equal(html.length, documentSizeLimit - 107);
  assert.equal(Buffer.byteLength(html, "utf8"), documentSizeLimit + 1);
  reject(fixture(html), "document");
});

test("accepts U+3000 whitespace at the UTF-8 limit and rejects one byte above it within the character limit", () => {
  const paddingBytes = documentSizeLimit - officialByteLength;
  const wideSpaces = Math.floor(paddingBytes / 3);
  const html = "\u3000".repeat(wideSpaces) + " ".repeat(paddingBytes % 3) + officialMain;
  assert.equal(html.length, officialMain.length + wideSpaces + paddingBytes % 3);
  assert.ok(html.length < documentSizeLimit);
  assert.equal(Buffer.byteLength(html, "utf8"), documentSizeLimit);
  assert.deepEqual(parse(fixture(html)).evidenceReference, parse(fixture()).evidenceReference);
  const overflow = html + " ";
  assert.equal(overflow.length, html.length + 1);
  assert.ok(overflow.length <= documentSizeLimit);
  assert.equal(Buffer.byteLength(overflow, "utf8"), documentSizeLimit + 1);
  reject(fixture(overflow), "document");
});
