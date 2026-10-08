import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { XMLParser } from "fast-xml-parser";
import ts from "typescript";
import * as api from "../../services/bojContinuityCaptureAuthority";
import {
  acquireBojContinuityCaptureV1, readBojContinuityCaptureAsKnownAtV1,
  createBojContinuityCaptureAuthorityV1, BojContinuityCaptureErrorV1,
  type BojContinuityCaptureAuthorityV1, type BojContinuityCaptureReceiptV1,
  type BojContinuityCaptureFailureCodeV1, type BojContinuityCaptureDependenciesV1,
  type AcquireBojContinuityCaptureInputV1, type ReadBojContinuityCaptureInputV1,
} from "../../services/bojContinuityCaptureAuthority";
import { parseBojDecisionContinuityEvidenceV1 } from "../../providers/boj/decisionContinuityEvidence";
import { readBojPolicyDecisionCaptureAsKnownAtV1 } from "../../services/bojPolicyDecisionCaptureAuthority";

// Complete offline publisher page inspected on 2026-10-08. No live network in tests.
// The main matches the already qualified parser fixture. Fixture integrity does not
// authenticate origin or attest historical acquisition; only controlled test dependencies use it.
const officialPage = [
  "<!DOCTYPE html><html lang=\"en\">\r\n",
  "<head prefix=\"og: http://ogp.me/ns# fb: http://ogp.me/ns/fb# article: http://ogp.me/ns/article#\">\r\n",
  "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\"><meta name=\"author\" content=\"\">\r\n",
  "<meta name=\"description\" content=\"\">\r\n",
  "<meta name=\"keywords\" content=\"\">\r\n",
  "<title>Minutes of the Monetary Policy Meeting on June 13 and 14, 2024  : 日本銀行 Bank of Japan</title>\r\n",
  "<link rel=\"stylesheet\" type=\"text/css\" href=\"/common2/css/wysiwyg.css\">\r\n",
  "<link rel=\"stylesheet\" type=\"text/css\" href=\"/common2/css/style.css\">\r\n",
  "\r\n",
  "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">\r\n",
  "<meta name=\"format-detection\" content=\"telephone=no\">\r\n",
  "<meta property=\"og:title\" content=\"Minutes of the Monetary Policy Meeting on June 13 and 14, 2024  : 日本銀行 Bank of Japan\">\r\n",
  "<meta property=\"og:type\" content=\"article\">\r\n",
  "<meta property=\"og:url\" content=\"https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2024/g240614.htm\">\r\n",
  "<meta property=\"og:image\" content=\"https://www.boj.or.jp/common2/img/common/og_img.jpg\">\r\n",
  "<meta property=\"og:site_name\" content=\"Bank of Japan\">\r\n",
  "<meta property=\"og:description\" content=\"\">\r\n",
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\r\n",
  "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\r\n",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100;300;400;500;700;900&display=swap\">\r\n",
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@600&display=swap\"></head>\r\n",
  "<body class=\"cate-mopo en\">\r\n",
  "\r\n",
  "\r\n",
  "\r\n",
  "<div class=\"block_skip\"><a href=\"#contents\">Skip to main content</a></div>\r\n",
  "<div class=\"clear_fix\">\r\n",
  "<header id=\"header_area\" class=\"lonav on\" role=\"banner\">\r\n",
  "  <button id=\"menuBtn\" aria-expanded=\"false\" aria-controls=\"left_col\">\r\n",
  "    <img class=\"open\" src=\"/common2/img/common/menu.png\" alt=\"Open the menu\">\r\n",
  "    <img class=\"close\" src=\"/common2/img/common/close.png\" alt=\"Close the menu\">\r\n",
  "  </button>\r\n",
  "  <div id=\"left_col\">\r\n",
  "    <!-- ▼▼　ヘッダー　▼▼-->\r\n",
  "    <div id=\"header\">\r\n",
  "  <p class=\"logo gen-disp_pc\"><a href=\"/en/\"><img src=\"/common2/img/common/logo.jpg\" alt=\"日本銀行 Bank of Japan\"></a></p>\r\n",
  "  <ul class=\"lang\">\r\n",
  "    <li lang=\"ja\"><a href=\"/\">日本語</a></li>\r\n",
  "    <li aria-current=\"page\"><em>English</em></li>\r\n",
  "  </ul>\r\n",
  "</div>\r\n",
  "    <!-- ▲▲　ヘッダー　▲▲-->\r\n",
  "    <!-- ▼▼　ナビゲーション　▼▼ -->\r\n",
  "    <nav id=\"glnav\" aria-label=\"Main menu\">\r\n",
  "      <ul class=\"glnav_ul\">\r\n",
  "      <li>\n",
  "<a class=\"glnav1st glnav-link glnav_home\" href=\"/en/\">Home</a>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav2\">About the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/index.htm\">About the Bank</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-1\">Outline of the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/index.htm\">Outline of the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/history/index.htm\">History</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/history/pre_gov/index.htm\">List of Governors</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/location/index.htm\">Location (Guide Map to Head Office) / Visiting the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/location/map.htm\">Head Office, Branches, and Overseas Offices</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/outline/imes_archive/index.htm\">Archives</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-2\">Organization of the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/index.htm\">Organization of the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/policyboard/index.htm\">Policy Board</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/tanto.htm\">Responsibilities of the Governor, Deputy Governors, and Executive Directors</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/organization/chart/index.htm\">Organization of Head office, Branches and Offices</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/boj_law/index.htm\">Laws and Rules</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/account/index.htm\">The Bank's Accounts</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-3\">Activities</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-3\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/index.htm\">Activities</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/principle.htm\">The Bank's Organizational Core Principles</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/strategy/index.htm\">Medium-Term Strategic Plan</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/activities/act/index.htm\">Annual Review</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/bcp/index.htm\">Business Continuity Planning</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/press/index.htm\">Speeches and Statements</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-4\">Research Papers, Reports, Speeches and Statements Related to the Bank</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-4\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to the Bank</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-4\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/release_2026/index.htm\">Other Releases</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/pr_events/index.htm\">Tours and Museums</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/education/index.htm\">Guides to the Bank</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav2-5\">Services</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav2-5\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/index.htm\">Services</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/bn/index.htm\">Exchange of Damaged Cash</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/kengaku.htm\">Tours of the Bank's Head Office</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav2-5\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/climate/index.htm\">Climate Change</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/about/link/index.htm\">Links</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li class=\"current\">\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav3\">Monetary Policy</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/index.htm\">Monetary Policy</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-1\">Outline of Monetary Policy</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/outline/index.htm\">Outline of Monetary Policy</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/outline/target.htm\">Price Stability Target of 2 Percent</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/outline/bpreview/index.htm\">Review of Monetary Policy from a Broad Perspective</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-2\">Monetary Policy Meetings</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/index.htm\">Monetary Policy Meetings</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/opinion_2026/index.htm\">Summary of Opinions</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/minu_2026/index.htm\">Minutes</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/mpmsche_minu/m_ref/index.htm\">Others</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/mpmdeci/index.htm\">Monetary Policy Releases</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-3\">Monetary Policy Measures</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-3\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/measures/index.htm\">Monetary Policy Measures</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/measures/mkt_ope/index.htm\">Market Operations</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/measures/term_cond/index.htm\">Principal Terms and Conditions</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/outlook/index.htm\">Outlook for Economic Activity and Prices</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/mopo/diet/index.htm\">Reports to the Diet</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav3-4\">Research Papers, Reports, Speeches and Statements Related to Monetary Policy</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav3-4\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to Monetary Policy</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/mopo/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav3-4\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav4\">Financial System</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav4\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/index.htm\">Financial System</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/outline/index.htm\">Overview: The Bank's Initiatives for Financial Stability</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/exam_monit/index.htm\">On-Site Examinations and Off-Site Monitoring</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/fsr/index.htm\">Financial System Report</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/fs_policy/index.htm\">Policy Actions for Financial Stability</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/cofsa/index.htm\">Coordination with the Financial Services Agency</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/finsys/c_aft/index.htm\">Seminars for Financial Institutions</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav4-1\">Other Releases Related to Financial System</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav4-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/release/index.htm\">Other Releases Related to Financial System</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/finsys/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav4-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav4\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav5\">Payments and Markets</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/index.htm\">Payments and Markets</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav5-1\">Outline of Payment and Settlement Systems</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/index.htm\">Outline of Payment and Settlement Systems</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_boj/index.htm\">Payment and Settlement Systems and the Bank</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_os/index.htm\">Oversight</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_forum/index.htm\">Forums</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/outline/pay_ps/index.htm\">Payment and Settlement Systems Operated by the Private Sector</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav5-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/bojnet/index.htm\">Operation of BOJ-NET</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/jgb_bes/index.htm\">JGB Book-Entry System</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/fintech/index.htm\">FinTech Center</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/digital/index.htm\">Central Bank Digital Currency</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav5-2\">Money Market</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/index.htm\">Money Market</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/jpy_cmte/index.htm\">Cross-Industry Committee on Japanese Yen Interest Rate Benchmarks</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/i_forum/index.htm\">Cross-Industry Forum on Interest Rate Benchmarks</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/sg/index.htm\">Study Group of Market Participants</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/market/r_forum/index.htm\">Repo Market Forum</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav5-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/bond/index.htm\">Bond Market</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/credit/index.htm\">Credit Market</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/forum/index.htm\">Forums and Conferences</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav5-3\">Research Papers, Reports, Speeches and Statements Related to Payment and Markets</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav5-3\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to Payment and Markets</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/psr/index.htm\">Payment and Settlement Systems Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/mor/index.htm\">Market Operations in Each Fiscal Year</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/m-climate/index.htm\">Market Functioning Survey concerning Climate Change</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/paym/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav5-3\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/paym/release/index.htm\">Other Releases Related to Payment and Markets</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav5\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav6\">Banknotes, The Bank's Treasury Funds and JGS Services</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav6\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/index.htm\">Banknotes, The Bank's Treasury Funds and JGS Services</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav6-1\">General Information of Banknotes and Coins</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav6-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/index.htm\">General Information of Banknotes and Coins</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/n_note/index.htm\">A New Series of Banknotes and a New 500 Yen Coin</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/valid/index.htm\">Banknotes and Coins in Use</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/security/index.htm\">Security Features of Bank of Japan Notes</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/outline/index.htm\">Outline of Banknotes and Coins</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/related/index.htm\">Related Releases</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/note/n_other/index.htm\">Publications and Other Information</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/about/services/bn/index.htm\">Exchange of Damaged Cash</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav6-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/kokko/index.htm\">Treasury Funds Services</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/jgs/index.htm\">JGS Services</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/note_tfjgs/trans/index.htm\">The Bank's Transactions with the Government</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav6-2\">Research Papers, Reports, Speeches and Statements Related to Banknotes, Treasury Funds and JGS Services</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav6-2\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to Banknotes, Treasury Funds and JGS Services</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/note_tfjgs/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav6-2\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav6\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav7\">International Finance</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav7\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/index.htm\">International Finance</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/outline/index.htm\">Outline of International Finance</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/meeting/index.htm\">International Meetings</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/ex_assets/index.htm\">Foreign Currency Assets</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/cooperate/index.htm\">Cooperation with Other Central Banks</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/cemcoa/index.htm\">Financial Cooperation in Asia</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav7-1\">Research Papers, Reports, Speeches and Statements Related to International Finance</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav7-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li class=\"glnav-nolink\">Research Papers, Reports, Speeches and Statements Related to International Finance</li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/intl_finance/r_menu_ron/index.htm\">Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/intl_finance/r_menu_koen/index.htm\">Speeches</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/intl_finance/r_menu_dan/index.htm\">Statements</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav7-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/intl_finance/release/index.htm\">Other Releases Related to International Finance</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav7\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav8\">Research and Studies</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav8\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/index.htm\">Research and Studies</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/outline/index.htm\">Outline of Research and Studies</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/rs_all_2026/index.htm\">List of Reports & Research Papers</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav8-1\">BOJ Reports & Research Papers</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav8-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/index.htm\">BOJ Reports & Research Papers</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/fsr/index.htm\">Financial System Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/mor/index.htm\">Market Operations in Each Fiscal Year</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/psr/index.htm\">Payment and Settlement Systems Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/rer/index.htm\">Regional Economic Report</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/research/brp/ron_2026/index.htm\">Research Papers</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav8-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/wps_rev/index.htm\">Working Paper Series, Review Series, and Research Laboratory Series</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/research_data/index.htm\">Research Data</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/imes/index.htm\">Research Papers Released by IMES</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/other_release/index.htm\">Study Group Reports</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/o_survey/index.htm\">Opinion Survey</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/conf/index.htm\">Conferences</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/bigdata/index.htm\">Alternative Data Analysis</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/research/past_release/index.htm\">Discontinued Research Releases</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav8\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav1st\" aria-expanded=\"false\" aria-controls=\"glnav9\">Statistics</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav9\" class=\"glnav1st_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/index.htm\">Statistics</a></li>\n",
  "<li>\n",
  "<button class=\"glnav-btn glnav2nd\" aria-expanded=\"false\" aria-controls=\"glnav9-1\">Outline of Statistics and Statistical Release Schedule</button>\n",
  "<div class=\"slide_box\">\n",
  "<ul id=\"glnav9-1\" class=\"glnav2nd_ul glnav-disp_non\" aria-hidden=\"true\">\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/index.htm\">Outline of Statistics and Statistical Release Schedule</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/notice_2026/index.htm\">Notices of Changes and Corrections</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/exp/index.htm\">Explanations of Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/general_notice/index.htm\">Notices of Changes and Revisions</a></li>\n",
  "<li><a class=\"glnav-link glnav3rd\" href=\"/en/statistics/outline/note/index.htm\">Notes</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav2nd_close\" aria-expanded=\"false\" aria-controls=\"glnav9-1\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/boj/index.htm\">Bank of Japan Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/money/index.htm\">Currency</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/market/index.htm\">Financial Markets</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/asli_fi/index.htm\">Financial Institutions Accounts</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/dl/index.htm\">Deposits and Loans Market</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/sj/index.htm\">Flow of Funds</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/bis/index.htm\">Related to BIS/FSB</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/set/index.htm\">Payment and Settlement</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/tk/index.htm\">TANKAN</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/pi/index.htm\">Prices</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/public/index.htm\">Public Finance</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/br/index.htm\">Balance of Payments Related Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"/en/statistics/stop/index.htm\">Discontinued Statistics / Revised Base Statistics</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"https://www.imes.boj.or.jp/en/historical/hstat/hstat.html\">Historical Statistics on the Web Site of IMES</a></li>\n",
  "<li><a class=\"glnav-link glnav2nd\" href=\"https://www.stat-search.boj.or.jp/index_en.html\">BOJ Time-Series Data Search</a></li>\n",
  "<li><button class=\"glnav-btn_close glnav1st_close\" aria-expanded=\"false\" aria-controls=\"glnav9\"><img src=\"/common2/img/common/close.png\" alt=\"close\"></button></li>\n",
  "</ul>\n",
  "</div>\n",
  "</li>\n",
  "\r\n",
  "      </ul>\r\n",
  "    </nav>\r\n",
  "    <!-- ▲▲　ナビゲーション　▲▲ -->\r\n",
  "    <!-- ▼▼　SNS　▼▼-->\r\n",
  "    <aside role=\"complementary\" id=\"sns\">\r\n",
  "    <ul>\r\n",
  "      <li><a class=\"img\" href=\"https://twitter.com/Bank_of_Japan_e\"><img src=\"/common2/img/common/sns_x.gif\" alt=\"x\"></a></li>\r\n",
  "      <li><a class=\"img\" href=\"https://www.facebook.com/BankofJapan.en\"><img src=\"/common2/img/common/sns_facebook.gif\" alt=\"facebook\"></a></li>\r\n",
  "      <li><a class=\"img\" href=\"https://www.youtube.com/user/BOJchannel/\"><img src=\"/common2/img/common/sns_youtube.gif\" alt=\"youtube\"></a></li>\r\n",
  "    </ul>\r\n",
  "  <p class=\"lnk1\"><a href=\"/en/snspolicy.htm\">Social Networking Site Management Policy</a></p>\r\n",
  "</aside>\r\n",
  "    <!-- ▲▲　SNS　▲▲-->\r\n",
  "  </div>\r\n",
  "</header>\r\n",
  "  <div id=\"right_col\">\r\n",
  "    <div id=\"overlay\" class=\"off glnav-disp_non\"></div>\r\n",
  "    <!-- ▼▼　メインビジュアル　▼▼-->\r\n",
  "    <aside role=\"complementary\" id=\"main_v\">\r\n",
  "      <div class=\"logo gen-disp_sp\"><a href=\"/en/\"><img src=\"/common2/img/common/logo_s.jpg\" alt=\"日本銀行 Bank of Japan\"></a></div>\r\n",
  "      <!-- ▼▼　ヘッダ部タイトル　▼▼-->\r\n",
  "      <p class=\"main_v-title\">Monetary Policy</p>\r\n",
  "      <!-- ▲▲　ヘッダ部タイトル　▲▲-->\r\n",
  "      <div class=\"main_v-text_area\">\r\n",
  "        <!-- ▼▼　検索フォーム　▼▼-->\r\n",
  "        <form class=\"search_form\" role=\"search\">\r\n",
  "        <div class=\"searchbox\">\r\n",
  "          <input id=\"qs_sslang\" value=\"1\" type=\"hidden\">\r\n",
  "          <div class=\"autocomplete\">\r\n",
  "            <input id=\"qs_keyword\" name=\"search\" type=\"text\" title=\"search\" autocomplete=\"off\" list=\"suggest0-list\" role=\"combobox\" aria-owns=\"suggest0-list\" aria-autocomplete=\"list\" aria-expanded=\"false\">\r\n",
  "            <datalist id=\"suggest0-list\"></datalist>\r\n",
  "          </div><input onclick=\"QSSimpleSearchOnSubmit();return false\" type=\"image\" src=\"/common2/img/common/search.gif\" alt=\"Search\">\r\n",
  "          <div id=\"suggest0-result\" aria-live=\"polite\" role=\"status\" class=\"visually-hidden\"></div>\r\n",
  "        </div>\r\n",
  "      </form>\r\n",
  "        <!-- ▲▲　検索フォーム　▲▲-->\r\n",
  "        <!-- ▼▼　パンくずリスト　▼▼-->\r\n",
  "        <nav id=\"topic_path\" role=\"navigation\" aria-label=\"current position\">\r\n",
  "          <ul><li><a href=\"/en/index.htm\">Home</a>&gt;</li><li><a href=\"/en/mopo/index.htm\">Monetary Policy</a>&gt;</li><li><a href=\"/en/mopo/mpmsche_minu/index.htm\">Monetary Policy Meetings</a>&gt;</li><li><a href=\"/en/mopo/mpmsche_minu/minu_2024/index.htm\">Minutes of the Monetary Policy Meetings 2024</a>&gt;</li><li aria-current=\"page\"><em>Minutes of the Monetary Policy Meeting on June 13 and 14, 2024</em></li></ul>\r\n",
  "        </nav>\r\n",
  "        <!-- ▲▲　パンくずリスト　▲▲-->\r\n",
  "      </div>\r\n",
  "    </aside>\r\n",
  "    <!-- ▲▲　メインビジュアル　▲▲-->\r\n",
  "    <main id=\"contents\">\r\n",
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
  "    </main>\r\n",
  "    <!-- ▼▼　フッター　▼▼-->\r\n",
  "    <footer id=\"footer\">\r\n",
  "  <div class=\"outline\">\r\n",
  "    <div class=\"logo_area\">\r\n",
  "      <div class=\"left logo_area-toggle_left\">\r\n",
  "        <p class=\"logo\"><a href=\"/en/\"><img src=\"/common2/img/common/logo.gif\" alt=\"日本銀行 Bank of Japan\"></a></p>\r\n",
  "        <address>\r\n",
  "          2-1-1 Nihonbashi-Hongokucho,Chuo-ku,Tokyo (<a href=\"/en/about/outline/location/index.htm\">location</a>)<br>\r\n",
  "          Tel:+81-3-3279-1111\r\n",
  "        </address>\r\n",
  "      </div><!-- /left -->\r\n",
  "      <div class=\"right logo_area_right-top\">\r\n",
  "        <ul>\r\n",
  "          <li><a href=\"/en/about/services/index.htm\">Services</a>\r\n",
  "            <ul>\r\n",
  "              <li><a href=\"/en/about/services/bn/index.htm\">Exchange of Damaged Cash</a></li>\r\n",
  "            </ul>\r\n",
  "          </li>\r\n",
  "          <li>Organization\r\n",
  "            <ul>\r\n",
  "              <li><a href=\"/en/about/organization/index.htm\">Organization of the Bank</a></li>\r\n",
  "              <li><a href=\"/en/about/outline/location/map.htm\">Head Office, Branches, and Overseas Offices</a></li>\r\n",
  "            </ul>\r\n",
  "          </li>\r\n",
  "        </ul>\r\n",
  "      </div><!-- /right -->\r\n",
  "      <div class=\"left logo_area-toggle_bottom\">\r\n",
  "        <p class=\"logo\"><a href=\"/en/\"><img src=\"/common2/img/common/logo.gif\" alt=\"日本銀行 Bank of Japan\"></a></p>\r\n",
  "        <address>\r\n",
  "          2-1-1 Nihonbashi-Hongokucho,Chuo-ku,Tokyo <span class=\"gen-disp_inline-block\">(<a href=\"/en/about/outline/location/index.htm\">location</a>)</span><br>\r\n",
  "          Tel:+81-3-3279-1111\r\n",
  "        </address>\r\n",
  "      </div><!-- /left -->\r\n",
  "    </div>\r\n",
  "    <dl class=\"nav\">\r\n",
  "      <dt>Other Links</dt>\r\n",
  "      <dd><a class=\"no_icon\" href=\"https://www.imes.boj.or.jp/en/index.html\">Institute for Monetary and Economic Studies</a></dd>\r\n",
  "    </dl>\r\n",
  "    <ul class=\"nav\">\r\n",
  "      <li><a href=\"/en/about/abouthp.htm\">About the Site</a></li>\r\n",
  "      <li><a href=\"/en/mailing/index.htm\">E-mail Service</a></li>\r\n",
  "      <li><a href=\"/en/help.htm\">Help</a></li>\r\n",
  "      <li><a href=\"/en/about/services/contact.htm\">Contact</a></li>\r\n",
  "      <li><a href=\"/en/about/link/index.htm\">Links</a></li>\r\n",
  "      <li><a href=\"/en/about/sitemap.htm\">Site Map</a></li>\r\n",
  "    </ul>\r\n",
  "  </div><!-- /outline -->\r\n",
  "  <p id=\"copy\">\r\n",
  "    <small>Copyright Bank of Japan All Rights Reserved.</small>\r\n",
  "    <a href=\"#header_area\" id=\"page_top\"><img src=\"/common2/img/common/page_top.gif\" alt=\"Page top\"></a>\r\n",
  "  </p>\r\n",
  "</footer><!-- /footer -->\r\n",
  "    <!-- ▲▲　フッター　▲▲-->\r\n",
  "  </div>\r\n",
  "</div>\r\n",
  "<!-- ▼▼　JS読み込み　▼▼-->\r\n",
  "<script src=\"/common2/js/common2.js\"></script>\r\n",
  "<script src=\"/common2/js/qssearch.js\"></script>\r\n",
  "<!-- ▲▲　JS読み込み　▲▲--></body>\r\n",
  "</html>\r\n",
].join("");

const url = "https://www.boj.or.jp/en/mopo/mpmsche_minu/minu_2024/g240614.htm";
const officialMain = officialPage.slice(officialPage.indexOf('<main id="contents">'), officialPage.indexOf("</main>") + 7);
const maxBytes = 2 * 1024 * 1024;
const F = Date.parse("2026-10-08T12:00:00.789Z");
const publicationFloor = Date.parse("2024-08-05T00:00:00Z");
const at = (time = F) => new Date(time).toISOString();
const request = (): AcquireBojContinuityCaptureInputV1 => ({ signal: new AbortController().signal });
function response(body: BodyInit | null = officialPage, headers: Record<string, string> = {}) {
  const result = new Response(body, { headers: { "Content-Type": "text/html;charset=UTF-8", ...headers } });
  Object.defineProperty(result, "url", { configurable: true, value: url });
  return result;
}
function authority(html = officialPage, time = F) {
  return createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => response(html), nowUnixMilliseconds: () => time });
}
function assessment(receipt: BojContinuityCaptureReceiptV1, cutoff = F): ReadBojContinuityCaptureInputV1 {
  return { receipt, evaluatedAt: at(F + 1000), knowledgeCutoff: at(cutoff) };
}
async function acquire(owner: BojContinuityCaptureAuthorityV1, input = request()) {
  const result = await owner.acquire(input);
  assert.equal(result.status, "acquired"); assert.ok(Object.isFrozen(result));
  assert.deepEqual(Reflect.ownKeys(result), ["status", "receipt"]);
  return result.receipt;
}
function read(owner: BojContinuityCaptureAuthorityV1, receipt: BojContinuityCaptureReceiptV1, cutoff = F) {
  const result = owner.readAsKnownAt(assessment(receipt, cutoff));
  assert.ok(result.status === "available"); return result.capture;
}
function isCode(code: BojContinuityCaptureFailureCodeV1) {
  return (error: unknown) => error instanceof BojContinuityCaptureErrorV1 && error.code === code;
}
function eachObject(value: unknown, visit: (value: object) => void): void {
  if (typeof value !== "object" || value === null) return;
  visit(value); for (const child of Object.values(value)) eachObject(child, visit);
}
function deferred<T>() {
  let complete!: (value: T) => void;
  const promise = new Promise<T>(resolve => { complete = resolve; }); return { promise, complete };
}
async function fails(fetchImpl: typeof fetch, code: BojContinuityCaptureFailureCodeV1) {
  let clocks = 0; let issued: unknown;
  const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl, nowUnixMilliseconds: () => { clocks++; return F; } });
  await assert.rejects(async () => { issued = await owner.acquire(request()); }, isCode(code));
  assert.equal(clocks, 0); assert.equal(issued, undefined);
  assert.throws(() => owner.readAsKnownAt(assessment({} as BojContinuityCaptureReceiptV1)), isCode("invalid-receipt"));
}

test("exact qualified source acquisition preserves the original relationship and parser provenance", async () => {
  assert.equal(createHash("sha256").update(officialMain).digest("hex"), "391cc09636deb3e1064169393343209dbf753c743abef97e1fbd93fa58b80f1c");
  let fetches = 0, clocks = 0;
  const owner = createBojContinuityCaptureAuthorityV1({
    fetchImpl: async (source, init) => {
      fetches++; assert.equal(source, url); assert.equal(init?.redirect, "error"); assert.equal(init?.method, "GET");
      assert.equal(init?.cache, "no-store"); assert.deepEqual(init?.headers, { Accept: "text/html", "Accept-Encoding": "identity" });
      assert.ok(init?.signal instanceof AbortSignal); return response(officialPage, { "Content-Length": String(Buffer.byteLength(officialPage)) });
    }, nowUnixMilliseconds: () => { clocks++; return F; },
  });
  const receipt = await acquire(owner); const capture = read(owner, receipt);
  assert.equal(fetches, 1); assert.equal(clocks, 1); assert.equal(capture.knownAt, at());
  const expected = parseBojDecisionContinuityEvidenceV1({ sourceUrl: url, documentKind: "mpm-minutes-english-html", html: officialMain });
  assert.deepEqual(capture.sourceFacts, expected);
  assert.equal(capture.sourceFacts.relationship, "source-stated-previous-meeting");
  assert.equal(capture.sourceFacts.canonicalMapping.referencedDecisionId, "japan-boj-policy-decision:2024-04-26");
  assert.deepEqual(capture.sourceFacts.referencedGuideline, { shape: "range", lower: 0, upper: 0.1, qualification: "around", unit: "percent" });
  assert.equal(capture.sourceFacts.source.publication.date, "2024-08-05");
  assert.equal(capture.sourceFacts.provenance.acquisitionTrust, "not-established");
  assert.equal(capture.provenance.acquisitionTrust, "authority-owned");
  assert.equal(capture.provenance.officialSuccessionVerification, "not-performed");
  assert.equal(capture.acquiredBodyDigest.value, createHash("sha256").update(officialPage).digest("hex"));
  assert.equal(capture.acquiredBodyDigest.byteLength, Buffer.byteLength(officialPage));
  assert.notEqual(capture.acquiredBodyDigest.value, capture.sourceFacts.source.documentDigest.value);
  assert.deepEqual(Reflect.ownKeys(receipt), []); assert.equal(Object.getPrototypeOf(receipt), null); assert.ok(Object.isFrozen(receipt));
});


// Exercise extraction through acquisition and receipt reads, with native stream cleanup observed.
// These shell-only changes keep the complete qualified main byte-for-byte unchanged.
function withShellSibling(markup: string): string {
  const anchor = '<div id="right_col">';
  assert.equal(officialPage.split(anchor).length, 2);
  return officialPage.replace(anchor, anchor + markup);
}
async function checkExtractionCapture(html: string, accepted: boolean) {
  assert.ok(Buffer.byteLength(html) < maxBytes, "extraction probe stays below acquisition ceiling");
  assert.equal(html.slice(html.indexOf('<main id="contents">'), html.indexOf("</main>") + 7), officialMain);
  const expected = parseBojDecisionContinuityEvidenceV1({ sourceUrl: url, documentKind: "mpm-minutes-english-html", html: officialMain });
  const caller = new AbortController();
  let clocks = 0, cancels = 0, releases = 0, reachedEof = false;
  let issued: unknown, acquisitionSignal: AbortSignal | undefined;
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(html)); controller.close(); } });
  const nativeGetReader = stream.getReader.bind(stream);
  Object.defineProperty(stream, "getReader", { value: () => {
    const reader = nativeGetReader();
    const nativeRead = reader.read.bind(reader), nativeCancel = reader.cancel.bind(reader), nativeRelease = reader.releaseLock.bind(reader);
    reader.read = async () => { const chunk = await nativeRead(); if (chunk.done) reachedEof = true; return chunk; };
    reader.cancel = reason => { cancels++; return nativeCancel(reason); };
    reader.releaseLock = () => { releases++; nativeRelease(); };
    return reader;
  } });
  const owner = createBojContinuityCaptureAuthorityV1({
    fetchImpl: async (_source, init) => { acquisitionSignal = init?.signal ?? undefined; return response(stream); },
    nowUnixMilliseconds: () => { clocks++; return F; },
  });
  const nativeTimeout = globalThis.setTimeout, nativeClearTimeout = globalThis.clearTimeout;
  const pendingTimers = new Set<unknown>();
  try {
    Reflect.set(globalThis, "setTimeout", (...args: Parameters<typeof setTimeout>) => {
      const timer = Reflect.apply(nativeTimeout, globalThis, args); pendingTimers.add(timer); return timer;
    });
    Reflect.set(globalThis, "clearTimeout", (...args: Parameters<typeof clearTimeout>) => {
      pendingTimers.delete(args[0]); return Reflect.apply(nativeClearTimeout, globalThis, args);
    });
    if (accepted) {
      const receipt = await acquire(owner, { signal: caller.signal }); issued = receipt;
      assert.deepEqual(read(owner, receipt).sourceFacts, expected);
      assert.deepEqual(owner.readAsKnownAt(assessment(receipt, F - 1)), { status: "not-known-as-of" });
      assert.equal(clocks, 1); assert.equal(cancels, 0);
    } else {
      await assert.rejects(async () => { issued = await owner.acquire({ signal: caller.signal }); }, isCode("html-layout"));
      assert.equal(clocks, 0); assert.equal(issued, undefined);
      assert.throws(() => owner.readAsKnownAt(assessment({} as BojContinuityCaptureReceiptV1)), isCode("invalid-receipt"));
      assert.equal(cancels, 1);
    }
    assert.equal(reachedEof, true); assert.equal(releases, 1); assert.equal(stream.locked, false);
    assert.ok(acquisitionSignal instanceof AbortSignal); assert.equal(acquisitionSignal.aborted, !accepted);
    assert.equal(getEventListeners(caller.signal, "abort").length, 0);
    assert.equal(getEventListeners(acquisitionSignal, "abort").length, 0);
    assert.equal(pendingTimers.size, 0);
  } finally {
    Reflect.set(globalThis, "setTimeout", nativeTimeout); Reflect.set(globalThis, "clearTimeout", nativeClearTimeout);
    for (const timer of pendingTimers) Reflect.apply(nativeClearTimeout, globalThis, [timer]);
  }
}

for (const script of ["common2", "qssearch"] as const) {
  test("self-closing non-void syntax rejects qualified " + script + " script before receipt issuance", async () => {
    const original = '<script src="/common2/js/' + script + '.js"></script>';
    assert.equal(officialPage.split(original).length, 2);
    await checkExtractionCapture(officialPage.replace(original, original.replace('"></script>', '"/></script>')), false);
  });
}
for (const name of ["div", "span", "p"] as const) {
  test("self-closing non-void syntax rejects equivalent " + name + " before receipt issuance", async () => {
    await checkExtractionCapture(withShellSibling('<' + name + ' title="probe"/></' + name + '>'), false);
  });
}
test("authentic unchanged fixture and qualified external scripts still acquire readable evidence", async () => {
  assert.ok(officialPage.includes('<script src="/common2/js/common2.js"></script>'));
  assert.ok(officialPage.includes('<script src="/common2/js/qssearch.js"></script>'));
  await checkExtractionCapture(officialPage, true);
});
test("qualified void tags retain supported self-closing syntax", async () => {
  await checkExtractionCapture(withShellSibling('<br/><hr/><img src="/probe.png"/><input type="text"/>'), true);
});

// Scan distance includes the closing '>' offset from '<': 4096 means a 4097-character token.
for (const distance of [4096, 4097] as const) {
  test("tag scan distance boundary " + distance + (distance === 4096 ? " accepts" : " rejects before clock"), async () => {
    const prefix = '<div title="', suffix = '">';
    const opening = prefix + "x".repeat(distance + 1 - prefix.length - suffix.length) + suffix;
    assert.equal(opening.length - 1, distance);
    await checkExtractionCapture(withShellSibling(opening + "</div>"), distance === 4096);
  });
}
// Independently count literal fixture tags, excluding comments and the two indivisible script closes.
// Padding uses supported void siblings, so neither depth nor tag length approaches its limit.
const fixtureTagTokens = officialPage.replace(/<!--[\s\S]*?-->/g, "").match(/<\/?[a-z][^>]*>/g)!;
const fixtureCountedTags = fixtureTagTokens.length - fixtureTagTokens.filter(token => token === "</script>").length;
for (const total of [20_000, 20_001] as const) {
  test("tag count boundary " + total + (total === 20_000 ? " accepts" : " rejects before clock"), async () => {
    assert.equal(fixtureCountedTags, 1664);
    const padding = "<br>".repeat(total - fixtureCountedTags);
    assert.equal(fixtureCountedTags + padding.length / 4, total);
    await checkExtractionCapture(withShellSibling(padding), total === 20_000);
  });
}
// The insertion point has four ancestors; close every added div before the unchanged main.
for (const depth of [60, 61] as const) {
  test("nesting depth boundary " + depth + (depth === 60 ? " accepts" : " rejects before clock"), async () => {
    const added = depth - 4;
    await checkExtractionCapture(withShellSibling("<div>".repeat(added) + "</div>".repeat(added)), depth === 60);
  });
}

for (const [label, change] of [
  ["bare main fragment", () => officialMain],
  ["missing main", (h: string) => h.replace(officialMain, "")],
  ["duplicate main", (h: string) => h.replace("</main>", '</main><main id="contents"></main>')],
  ["nested main", (h: string) => h.replace("</main>", '<main id="other"></main></main>')],
  ["missing closing main", (h: string) => h.replace("</main>", "")],
  ["wrong main close", (h: string) => h.replace("</main>", "</div>")],
  ["wrong main ID", (h: string) => h.replace('<main id="contents">', '<main id="other">')],
  ["unclosed main quote", (h: string) => h.replace('<main id="contents">', '<main id="contents>')],
  ["hidden main", (h: string) => h.replace('<main id="contents">', '<main id="contents" hidden>')],
  ["inert main", (h: string) => h.replace('<main id="contents">', '<main id="contents" inert>')],
  ["aria-hidden main", (h: string) => h.replace('<main id="contents">', '<main id="contents" aria-hidden="true">')],
  ["CSS-hidden main", (h: string) => h.replace('<main id="contents">', '<main id="contents" style="display:none">')],
  ["hidden ancestor", (h: string) => h.replace('<div id="right_col">', '<div id="right_col" hidden>')],
  ["inert ancestor", (h: string) => h.replace('<div class="clear_fix">', '<div class="clear_fix" inert>')],
  ["CSS ancestor", (h: string) => h.replace('<div id="right_col">', '<div id="right_col" style="visibility:hidden">')],
  ["altered body", (h: string) => h.replace('<body class="cate-mopo en">', '<body class="cate-mopo en" hidden>')],
  ["template main", (h: string) => h.replace(officialMain, "<template>" + officialMain + "</template>")],
  ["noscript main", (h: string) => h.replace(officialMain, "<noscript>" + officialMain + "</noscript>")],
  ["raw script main", (h: string) => h.replace(officialMain, '<script type="text/plain">' + officialMain + "</script>")],
  ["commented main", (h: string) => h.replace(officialMain, "<!--" + officialMain + "-->")],
  ["textarea main", (h: string) => h.replace(officialMain, "<textarea>" + officialMain + "</textarea>")],
  ["foreign SVG main", (h: string) => h.replace(officialMain, "<svg>" + officialMain + "</svg>")],
  ["extra ancestor", (h: string) => h.replace(officialMain, "<div>" + officialMain + "</div>")],
  ["inline stylesheet", (h: string) => h.replace("</head>", '<style>main{display:none}</style></head>')],
  ["duplicate ID", (h: string) => h.replace('<div id="right_col">', '<div id="contents">')],
  ["duplicate attributes", (h: string) => h.replace('<main id="contents">', '<main id="contents" id="contents">')],
  ["base substitution", (h: string) => h.replace("</head>", '<base href="https://evil.example/"></head>')],
  ["inline script", (h: string) => h.replace("</head>", '<script>document.querySelector("main").hidden=true</script></head>')],
  ["additional html", (h: string) => h + '<html lang="en"></html>'],
  ["malformed shell", (h: string) => h.replace("</header>", "</footer>")],
  ["truncated page without declared length", (h: string) => h.slice(0, h.indexOf("</main>"))],
] as const) test("structure boundary rejects " + label + " before clock", async () => {
  const altered = change(officialPage); assert.notEqual(altered, officialPage);
  await fails(async () => response(altered), "html-layout");
});

for (const [label, change] of [
  ["changed previous meeting", (h: string) => h.replace("previous meeting on April 25 and 26, 2024", "previous meeting on May 1 and 2, 2024")],
  ["source publication conflict", (h: string) => h.replace("August 5, 2024<br>", "June 14, 2024<br>")],
  ["publisher conflict", (h: string) => h.replace("August 5, 2024<br>\nBank of Japan", "August 5, 2024<br>\nAnother Bank")],
  ["PDF identity conflict", (h: string) => h.replace("g240614.pdf", "g240426.pdf")],
  ["source relationship absent", (h: string) => h.replace("previous meeting on April 25 and 26, 2024", "meeting on April 25 and 26, 2024")],
] as const) test("existing parser rejection: " + label + " issues no receipt", async () => {
  const altered = change(officialPage); assert.notEqual(altered, officialPage);
  await fails(async () => response(altered), "parser-rejection");
});

for (const wrongUrl of [url.replace("https:", "http:"), url.replace("www.boj.or.jp", "boj.or.jp"),
  url.replace("www.boj.or.jp", "www.boj.or.jp.evil.example"), url.replace("g240614", "g240426"), url + "?q=1", url + "#fn7",
  url.replace("www.boj.or.jp", "user@www.boj.or.jp"), url.replace("www.boj.or.jp", "www.boj.or.jp:443")]) {
  test("response identity rejects " + wrongUrl, async () => {
    const wrong = response(); Object.defineProperty(wrong, "url", { value: wrongUrl });
    await fails(async () => wrong, "source-identity");
  });
}
for (const markup of ['<meta property="og:url" content="https://evil.example/">', '<link rel="canonical" href="https://evil.example/">']) {
  test("conflicting page source identity " + markup, async () => {
    await fails(async () => response(officialPage.replace("</head>", markup + "</head>")), "source-identity");
  });
}
test("redirect flags, HTTP redirects and native redirect failures are rejected", async () => {
  const redirected = response(); Object.defineProperty(redirected, "redirected", { value: true });
  await fails(async () => redirected, "redirect");
  await fails(async () => new Response(null, { status: 302, headers: { Location: url } }), "redirect");
  await fails(async () => { throw new TypeError("fetch failed", { cause: new Error("unexpected redirect") }); }, "redirect");
});
test("network failure, missing body, unsuccessful HTTP and partial content withhold trust", async () => {
  await fails(async () => { throw new TypeError("fetch failed", { cause: Object.assign(new Error("socket"), { code: "ECONNRESET" }) }); }, "network");
  await fails(async () => response(null), "missing-body");
  await fails(async () => new Response("failure", { status: 503 }), "http");
  await fails(async () => new Response("partial", { status: 206 }), "truncated-response");
});

for (const contentType of ["", "application/pdf", "application/xhtml+xml", "text/plain", "text/html;charset=shift_jis",
  "text/html;charset=latin1", 'text/html;charset="utf-8', 'text/html;charset=utf-8"', "text/html;charset=utf-8;charset=utf-8",
  "text/html;unknown=1", "text/html;charset=utf-8;boundary=1"]) {
  test("strict content type rejects " + contentType, async () => fails(async () => response(officialPage, { "Content-Type": contentType }), "content-type"));
}
for (const contentType of ["text/html", "TEXT/HTML; CHARSET=UTF-8", 'text/html; charset="utf-8"']) {
  test("supported content type " + contentType, async () => {
    const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => response(officialPage, { "Content-Type": contentType }), nowUnixMilliseconds: () => F });
    assert.equal(read(owner, await acquire(owner)).knownAt, at());
  });
}
for (const encoding of ["gzip", "br", "deflate", "identity,gzip"]) {
  test("uncomparable encoded Content-Length is rejected: " + encoding, async () => fails(async () => response(officialPage, { "Content-Encoding": encoding }), "content-encoding"));
}
for (const length of ["-1", "1.2", "01", "abc", "1,1", "+1", "1e3"]) {
  test("invalid Content-Length " + length, async () => fails(async () => response(officialPage, { "Content-Length": length }), "content-length"));
}
test("oversized declared length cancels the body before taking a reader", async () => {
  let cancelled = 0; const body = new ReadableStream<Uint8Array>({ cancel() { cancelled++; } });
  await fails(async () => response(body, { "Content-Length": String(maxBytes + 1) }), "response-too-large");
  assert.equal(cancelled, 1); assert.equal(body.locked, false);
});
test("streamed byte overflow cancels the reader and releases its lock", async () => {
  let cancelled = 0; const body = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(new Uint8Array(maxBytes)); c.enqueue(new Uint8Array(1)); }, cancel() { cancelled++; },
  });
  await fails(async () => response(body), "response-too-large"); assert.equal(cancelled, 1); assert.equal(body.locked, false);
});
for (const extra of [-1, 1]) test("declared/actual length mismatch " + extra + " rejects and releases reader", async () => {
  const result = response(officialPage, { "Content-Length": String(Buffer.byteLength(officialPage) + extra) });
  const body = result.body!; await fails(async () => result, "truncated-response"); assert.equal(body.locked, false);
});
test("reader termination before completion is classified as truncation and releases the lock", async () => {
  let reads = 0;
  const body = new ReadableStream<Uint8Array>({ pull(c) {
    if (++reads === 1) c.enqueue(new TextEncoder().encode(officialPage.slice(0, 200)));
    else c.error(new TypeError("terminated", { cause: Object.assign(new Error("closed socket"), { code: "UND_ERR_SOCKET" }) }));
  } });
  await fails(async () => response(body), "truncated-response"); assert.equal(body.locked, false);
});
for (const corrupt of [new Uint8Array([0xc3, 0x28]), new Uint8Array([0xed, 0xa0, 0x80]), new Uint8Array([0xe2, 0x82])]) {
  test("malformed UTF-8 " + corrupt.join(",") + " rejects before structure or clock", async () => fails(async () => response(corrupt), "invalid-encoding"));
}
test("valid multibyte UTF-8 split across stream chunks decodes only after acquisition", async () => {
  const bytes = new TextEncoder().encode(officialPage); const split = bytes.findIndex(b => b > 127) + 1;
  const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => response(new ReadableStream<Uint8Array>({ start(c) {
    c.enqueue(bytes.subarray(0, split)); c.enqueue(bytes.subarray(split)); c.close();
  } })), nowUnixMilliseconds: () => F });
  assert.deepEqual(read(owner, await acquire(owner)).sourceFacts, parseBojDecisionContinuityEvidenceV1({ sourceUrl: url, documentKind: "mpm-minutes-english-html", html: officialMain }));
});

test("completion clock follows fetch, completed body, decoding, structure acceptance and parser acceptance", async () => {
  const fetching = deferred<void>(), delivered = deferred<Response>(), reading = deferred<void>();
  let completeBody!: () => void; let clocks = 0; const order: string[] = [];
  const originalDecode = TextDecoder.prototype.decode, originalParse = XMLParser.prototype.parse;
  try {
    TextDecoder.prototype.decode = function (this: TextDecoder, ...args: Parameters<typeof originalDecode>) {
      const result = originalDecode.apply(this, args); order.push("decoded"); return result;
    };
    XMLParser.prototype.parse = function (this: XMLParser, ...args: Parameters<typeof originalParse>) {
      assert.ok(!String(args[0]).includes('<html lang="en">'), "full page must never reach the fact parser");
      const result = originalParse.apply(this, args); order.push("parsed"); return result;
    } as typeof originalParse;
    const owner = createBojContinuityCaptureAuthorityV1({
      fetchImpl: async () => { order.push("fetch"); fetching.complete(); return delivered.promise; },
      nowUnixMilliseconds: () => {
        clocks++; assert.ok(order.indexOf("body-complete") < order.indexOf("decoded"));
        assert.ok(order.indexOf("decoded") < order.indexOf("parsed")); order.push("clock"); return F;
      },
    });
    const pending = acquire(owner); await fetching.promise; assert.equal(clocks, 0);
    const body = new ReadableStream<Uint8Array>({ start(c) {
      c.enqueue(new TextEncoder().encode(officialPage.slice(0, 500)));
      completeBody = () => { c.enqueue(new TextEncoder().encode(officialPage.slice(500))); order.push("body-complete"); c.close(); };
    }, pull() { reading.complete(); } });
    delivered.complete(response(body)); await reading.promise;
    assert.equal(clocks, 0); assert.equal(order.includes("decoded"), false);
    completeBody(); const receipt = await pending;
    assert.equal(order.at(-1), "clock"); assert.equal(clocks, 1); assert.equal(read(owner, receipt).knownAt, at()); assert.equal(body.locked, false);
  } finally { TextDecoder.prototype.decode = originalDecode; XMLParser.prototype.parse = originalParse; }
});

test("pre-aborted requests do not fetch or sample the clock", async () => {
  const controller = new AbortController(); controller.abort(); let fetches = 0, clocks = 0;
  const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => { fetches++; return response(); }, nowUnixMilliseconds: () => { clocks++; return F; } });
  await assert.rejects(owner.acquire({ signal: controller.signal }), isCode("aborted")); assert.equal(fetches, 0); assert.equal(clocks, 0);
});
for (const code of ["timeout", "aborted"] as const) test(code + " during noncooperative fetch disposes a late response", async () => {
  const delivered = deferred<Response>(), fetching = deferred<void>(); const controller = new AbortController();
  let internalSignal: AbortSignal | null = null; let clocks = 0, cancelled = 0;
  const owner = createBojContinuityCaptureAuthorityV1({
    fetchImpl: async (_url, init) => { internalSignal = init!.signal as AbortSignal; fetching.complete(); return delivered.promise; },
    nowUnixMilliseconds: () => { clocks++; return F; }, timeoutMs: code === "timeout" ? 20 : 15000,
  });
  const pending = owner.acquire({ signal: controller.signal }); const rejected = assert.rejects(pending, isCode(code));
  await fetching.promise; if (code === "aborted") controller.abort(); await rejected;
  assert.equal(clocks, 0); assert.ok(internalSignal && (internalSignal as AbortSignal).aborted);
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled++; } }); delivered.complete(response(body));
  await delivered.promise; await Promise.resolve(); await Promise.resolve();
  assert.equal(cancelled, 1); assert.equal(body.locked, false);
});
for (const code of ["timeout", "aborted"] as const) test(code + " during stalled body cancels and unlocks reader", async () => {
  const reading = deferred<void>(); const controller = new AbortController(); let clocks = 0, cancelled = 0;
  const body = new ReadableStream<Uint8Array>({ pull() { reading.complete(); }, cancel() { cancelled++; } });
  const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => response(body), nowUnixMilliseconds: () => { clocks++; return F; }, timeoutMs: code === "timeout" ? 20 : 15000 });
  const pending = owner.acquire({ signal: controller.signal }); const rejected = assert.rejects(pending, isCode(code));
  await reading.promise; if (code === "aborted") controller.abort(); await rejected;
  assert.equal(clocks, 0); assert.equal(cancelled, 1); assert.equal(body.locked, false);
});
test("cleanup cancellation rejection cannot replace the original failure or retain the reader", async () => {
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(maxBytes + 1)); }, cancel() { throw new Error("cleanup sentinel"); } });
  await fails(async () => response(body), "response-too-large"); assert.equal(body.locked, false);
});
test("caller abort during completion clock issues no receipt", async () => {
  const controller = new AbortController(); let issued: unknown;
  const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => response(), nowUnixMilliseconds: () => { controller.abort(); return F; } });
  await assert.rejects(async () => { issued = await owner.acquire({ signal: controller.signal }); }, isCode("aborted")); assert.equal(issued, undefined);
});
for (const value of [NaN, Infinity, -1, F + 0.5, Number.MAX_SAFE_INTEGER + 1, 253_402_300_800_000,
  publicationFloor - 1, Date.parse("2024-06-14T23:59:59.999Z"), null, undefined, "2026-10-08", new Date(F), Promise.resolve(F)]) {
  test("invalid completion clock " + String(value) + " fails closed", async () => {
    let clocks = 0, issued: unknown;
    const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => response(), nowUnixMilliseconds: () => { clocks++; return value as number; } });
    await assert.rejects(async () => { issued = await owner.acquire(request()); }, isCode("clock")); assert.equal(clocks, 1); assert.equal(issued, undefined);
  });
}
test("clock exceptions are classified and cannot mint receipt membership", async () => {
  const defect = new ReferenceError("clock sentinel"); let issued: unknown;
  const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => response(), nowUnixMilliseconds: () => { throw defect; } });
  await assert.rejects(async () => { issued = await owner.acquire(request()); }, e => isCode("clock")(e) && (e as Error).cause === defect);
  assert.equal(issued, undefined);
});
test("publication constraint accepts the conservative floor without backdating later captures", async () => {
  const owner = authority(officialPage, publicationFloor); const receipt = await acquire(owner);
  assert.equal(read(owner, receipt, publicationFloor).knownAt, at(publicationFloor));
  assert.deepEqual(owner.readAsKnownAt(assessment(receipt, publicationFloor - 1)), { status: "not-known-as-of" });
  const later = authority(); const capture = read(later, await acquire(later));
  assert.equal(capture.knownAt, at()); assert.notEqual(capture.knownAt, at(publicationFloor));
});

test("cutoffs immediately before, at and after knownAt use exact milliseconds", async () => {
  const owner = authority(); const receipt = await acquire(owner);
  const earlier = owner.readAsKnownAt(assessment(receipt, F - 1)); assert.deepEqual(earlier, { status: "not-known-as-of" });
  assert.deepEqual(Reflect.ownKeys(earlier), ["status"]); assert.ok(Object.isFrozen(earlier));
  assert.equal(read(owner, receipt, F).knownAt, at()); assert.deepEqual(read(owner, receipt, F + 1), read(owner, receipt));
  const sameOffset = at().replace("12:00:00", "14:00:00").replace("Z", "+02:00");
  assert.deepEqual(owner.readAsKnownAt({ ...assessment(receipt), knowledgeCutoff: sameOffset }), owner.readAsKnownAt(assessment(receipt)));
});
test("June 14, 2024 cutoffs can never admit a later minutes capture", async () => {
  const owner = authority(); const receipt = await acquire(owner);
  for (const instant of ["2024-06-14T00:00:00Z", "2024-06-14T23:59:59.999Z", "2024-08-04T23:59:59.999Z"]) {
    assert.deepEqual(owner.readAsKnownAt({ receipt, evaluatedAt: instant, knowledgeCutoff: instant }), { status: "not-known-as-of" });
  }
});
for (const value of [undefined, null, NaN, Infinity, F, "invalid", "2026-10-08", "2026-02-30T00:00:00Z", "2026-10-08T12:00:00",
  "1969-12-31T23:59:59Z", "2026-10-08T12:00:00.7899Z", {}]) {
  for (const field of ["knowledgeCutoff", "evaluatedAt"]) test("invalid " + field + " " + String(value), async () => {
    const owner = authority(); const receipt = await acquire(owner);
    assert.throws(() => owner.readAsKnownAt({ ...assessment(receipt), [field]: value } as ReadBojContinuityCaptureInputV1), isCode("invalid-cutoff"));
  });
}
test("cutoff later than explicit evaluation fails as future-cutoff, including one millisecond", async () => {
  const owner = authority(); const receipt = await acquire(owner);
  assert.throws(() => owner.readAsKnownAt({ receipt, evaluatedAt: at(), knowledgeCutoff: at(F + 1) }), isCode("future-cutoff"));
  assert.throws(() => owner.readAsKnownAt({ receipt, evaluatedAt: at(), knowledgeCutoff: "9999-12-31T23:59:59.999Z" }), isCode("future-cutoff"));
});
test("forged, copied, serialized, proxied and backdated receipts cannot authorize reads", async () => {
  const owner = authority(); const receipt = await acquire(owner); const capture = read(owner, receipt);
  const revoked = Proxy.revocable(receipt, {}); revoked.revoke();
  for (const fake of [null, undefined, 1, "receipt", {}, [], { ...receipt }, structuredClone(receipt), JSON.parse(JSON.stringify(receipt)),
    Object.freeze(Object.create(null)), Object.create(Object.getPrototypeOf(receipt), Object.getOwnPropertyDescriptors(receipt)),
    { [Symbol("receiptBrand")]: true }, { ...capture, knownAt: "2024-06-14T00:00:00Z" }, capture, capture.sourceFacts,
    new Proxy(receipt, { get() { throw new Error("receipt trap"); } }), revoked.proxy]) {
    assert.throws(() => owner.readAsKnownAt(assessment(fake as BojContinuityCaptureReceiptV1)), isCode("invalid-receipt"));
  }
  assert.equal(Reflect.set(receipt, "knownAt", "2024-06-14"), false);
  assert.equal(Reflect.set(receipt, "sourceUrl", "https://evil.example/"), false);
  assert.equal(Reflect.set(receipt, Symbol("receiptBrand"), true), false);
  assert.equal(Reflect.setPrototypeOf(receipt, {}), false); assert.equal(read(owner, receipt).knownAt, at());
});
test("private owner membership defeats cross-authority reuse and authority spoofing", async () => {
  const a = authority(), b = authority(); const receiptA = await acquire(a), receiptB = await acquire(b);
  assert.throws(() => a.readAsKnownAt(assessment(receiptB)), isCode("invalid-receipt"));
  assert.throws(() => b.readAsKnownAt(assessment(receiptA)), isCode("invalid-receipt"));
  for (const receipt of [receiptA, receiptB]) {
    assert.throws(() => readBojContinuityCaptureAsKnownAtV1(assessment(receipt)), isCode("invalid-receipt"));
    assert.throws(() => readBojPolicyDecisionCaptureAsKnownAtV1({ receipt: receipt as never, evaluatedAt: at() }), /Unrecognized/);
  }
  assert.ok(Object.isFrozen(a)); assert.deepEqual(Object.keys(a).sort(), ["acquire", "readAsKnownAt"]);
  assert.equal(Reflect.set(a, "readAsKnownAt", b.readAsKnownAt), false);
  assert.throws(() => a.readAsKnownAt.call(b, assessment(receiptB)), isCode("invalid-receipt"));
});
test("reader outputs are detached and frozen recursively; description mutation cannot change ownership", async () => {
  const owner = authority(), input = request(); const receipt = await acquire(owner, input); const readInput = assessment(receipt);
  const a = owner.readAsKnownAt(readInput), b = owner.readAsKnownAt(readInput); const objects = new Set<object>();
  eachObject(a, object => { objects.add(object); assert.ok(Object.isFrozen(object)); });
  eachObject(b, object => { assert.ok(!objects.has(object)); assert.ok(Object.isFrozen(object)); });
  assert.deepEqual(a, b); assert.equal(Object.isFrozen(input), false); assert.equal(Object.isFrozen(input.signal), false); assert.equal(Object.isFrozen(readInput), false);
  assert.ok(a.status === "available"); assert.equal(Reflect.set(a.capture.sourceFacts.referencedGuideline, "upper", 99), false);
  const copy = structuredClone(a); Reflect.set(copy.capture, "knownAt", "2024-06-14T00:00:00Z");
  Reflect.set(copy.capture.sourceFacts.source, "url", "https://evil.example/");
  assert.deepEqual(owner.readAsKnownAt(readInput), b);
  assert.throws(() => owner.readAsKnownAt(assessment(copy as unknown as BojContinuityCaptureReceiptV1)), isCode("invalid-receipt"));
});

for (const field of ["html", "sourceUrl", "documentKind", "knownAt", "nowUnixMilliseconds", "clock", "fetchImpl", "loadDocument", "receipt", "evidence", Symbol("extra")]) {
  test("caller acquisition cannot inject " + String(field), async () => {
    let fetches = 0, clocks = 0;
    const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => { fetches++; return response(); }, nowUnixMilliseconds: () => { clocks++; return F; } });
    for (const enumerable of [true, false]) {
      const input = request(); Object.defineProperty(input, field, { value: "spoof", enumerable });
      await assert.rejects(owner.acquire(input), isCode("invalid-request"));
      await assert.rejects(acquireBojContinuityCaptureV1(input), isCode("invalid-request"));
    }
    assert.equal(fetches, 0); assert.equal(clocks, 0);
  });
}
test("closed records reject accessors and proxy traps before invoking caller code", async () => {
  let calls = 0; const denied = () => { calls++; throw new Error("caller trap"); }; const owner = authority(); const receipt = await acquire(owner);
  const proxy = new Proxy(request(), { get: denied, ownKeys: denied, getOwnPropertyDescriptor: denied, getPrototypeOf: denied });
  const revoked = Proxy.revocable(request(), {}); revoked.revoke();
  for (const input of [proxy, revoked.proxy, { get signal() { return denied(); } }, Object.create({ signal: request().signal }),
    { signal: new Proxy(request().signal, {}) }, { signal: Object.create(AbortSignal.prototype) }]) {
    await assert.rejects(owner.acquire(input), isCode("invalid-request"));
  }
  const requestProxy = new Proxy(assessment(receipt), { get: denied, ownKeys: denied, getPrototypeOf: denied });
  assert.throws(() => owner.readAsKnownAt(requestProxy), isCode("invalid-receipt"));
  assert.throws(() => owner.readAsKnownAt({ receipt: {} as BojContinuityCaptureReceiptV1, get evaluatedAt() { return denied(); }, get knowledgeCutoff() { return denied(); } }), isCode("invalid-receipt"));
  assert.throws(() => owner.readAsKnownAt({ receipt, evaluatedAt: at(), get knowledgeCutoff() { return denied(); } }), isCode("invalid-request"));
  assert.throws(() => createBojContinuityCaptureAuthorityV1({ get fetchImpl() { return denied(); }, nowUnixMilliseconds: () => F }), isCode("invalid-request"));
  assert.equal(calls, 0);
});
test("configured dependencies are retained before asynchronous acquisition", async () => {
  const delivered = deferred<Response>(), fetching = deferred<void>(); const deps = {
    fetchImpl: async () => { fetching.complete(); return delivered.promise; }, nowUnixMilliseconds: () => F,
  };
  const owner = createBojContinuityCaptureAuthorityV1(deps); const pending = acquire(owner); await fetching.promise;
  Reflect.set(deps, "fetchImpl", () => { throw new Error("replacement fetch"); }); Reflect.set(deps, "nowUnixMilliseconds", () => publicationFloor);
  delivered.complete(response()); assert.equal(read(owner, await pending).knownAt, at()); assert.equal(Object.isFrozen(deps), false);
});
for (const timeoutMs of [0, -1, 15001, NaN, Infinity, 1.5, "20", undefined]) test("invalid configured timeout " + String(timeoutMs), () => {
  assert.throws(() => createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => response(), nowUnixMilliseconds: () => F, timeoutMs } as BojContinuityCaptureDependenciesV1), isCode("invalid-request"));
});
test("closed reader rejects extra identity, clock and hidden/symbol fields", async () => {
  const owner = authority(); const receipt = await acquire(owner);
  for (const field of ["sourceUrl", "knownAt", "clock", "capture", Symbol("extra")]) {
    for (const enumerable of [true, false]) {
      const input = assessment(receipt); Object.defineProperty(input, field, { value: 0, enumerable });
      assert.throws(() => owner.readAsKnownAt(input), isCode("invalid-request"));
    }
  }
});
test("non-production dependency defects propagate without issuing receipts", async () => {
  const defect = new ReferenceError("fetch defect"); let clocks = 0;
  const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => { throw defect; }, nowUnixMilliseconds: () => { clocks++; return F; } });
  await assert.rejects(owner.acquire(request()), e => e === defect); assert.equal(clocks, 0);
});
test("default owner samples Date.now only after successful acquisition; reads are pure", async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now; let fetches = 0, clocks = 0;
  try {
    globalThis.fetch = async source => { fetches++; assert.equal(source, url); return response(); };
    Date.now = () => { clocks++; assert.equal(fetches, 1); return F; };
    const result = await acquireBojContinuityCaptureV1(request()); assert.equal(clocks, 1);
    const forbidden = () => { throw new Error("reader side effect"); }; globalThis.fetch = forbidden; Date.now = forbidden;
    const known = readBojContinuityCaptureAsKnownAtV1(assessment(result.receipt)); assert.ok(known.status === "available"); assert.equal(known.capture.knownAt, at());
    assert.deepEqual(readBojContinuityCaptureAsKnownAtV1(assessment(result.receipt, F - 1)), { status: "not-known-as-of" });
    assert.throws(() => authority().readAsKnownAt(assessment(result.receipt)), isCode("invalid-receipt"));
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});
test("reader calls neither network, clocks, randomness nor schedulers", async () => {
  const owner = authority(); const receipt = await acquire(owner); const expected = owner.readAsKnownAt(assessment(receipt));
  const originalFetch = globalThis.fetch, originalNow = Date.now, originalRandom = Math.random;
  const timers = ["setTimeout", "setInterval", "setImmediate"] as const, originals = timers.map(key => globalThis[key]);
  const forbidden = () => { throw new Error("reader side effect"); };
  try {
    globalThis.fetch = forbidden; Date.now = forbidden; Math.random = forbidden; timers.forEach(key => Reflect.set(globalThis, key, forbidden));
    assert.deepEqual(owner.readAsKnownAt(assessment(receipt)), expected);
    assert.deepEqual(owner.readAsKnownAt(assessment(receipt, F - 1)), { status: "not-known-as-of" });
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; Math.random = originalRandom; timers.forEach((key, i) => Reflect.set(globalThis, key, originals[i])); }
});
test("server-only guard blocks acquisition, reads and factory access in a browser", async () => {
  const owner = authority(); const receipt = await acquire(owner); Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { await assert.rejects(owner.acquire(request()), /server-only/); assert.throws(() => owner.readAsKnownAt(assessment(receipt)), /server-only/); assert.throws(() => authority(), /server-only/); }
  finally { Reflect.deleteProperty(globalThis, "window"); }
});
test("minimal runtime API has no generic receipt issuer or predecessor verifier", () => {
  assert.deepEqual(Object.keys(api).sort(), ["BojContinuityCaptureErrorV1", "createBojContinuityCaptureAuthorityV1", "acquireBojContinuityCaptureV1", "readBojContinuityCaptureAsKnownAtV1"].sort());
});
test("fresh import performs no network, completion clock, scheduling, environment or storage work", () => {
  const filename = resolve("src/lib/markets/services/bojContinuityCaptureAuthority.ts");
  const script = [
    "const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');",
    "const original=Module._load;Module._load=function(n,p,m){if(n==='server-only')return {};if(/redis|persistence|r2|aws-sdk/.test(n))throw Error('storage import');return original.call(this,n,p,m);};",
    "require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,f);",
    "const denied=()=>{throw Error('import side effect');};globalThis.fetch=denied;Date.now=denied;Math.random=denied;globalThis.setTimeout=denied;globalThis.setInterval=denied;globalThis.setImmediate=denied;",
    "const originalEnv=process.env;process.env=new Proxy(originalEnv,{get:denied,ownKeys:denied});try{require(" + JSON.stringify(filename) + ");}finally{process.env=originalEnv;}",
  ].join("\n");
  const result = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr || result.stdout);
});
test("inactive authority imports only the qualified fact parser, strict instant parser and native infrastructure", () => {
  const source = readFileSync(resolve("src/lib/markets/services/bojContinuityCaptureAuthority.ts"), "utf8");
  const ast = ts.createSourceFile("authority.ts", source, ts.ScriptTarget.Latest, true);
  const imports = ast.statements.filter(ts.isImportDeclaration).map(n => (n.moduleSpecifier as ts.StringLiteral).text);
  assert.deepEqual(imports, ["server-only", "node:crypto", "node:perf_hooks", "node:util", "../events/eventClock", "../providers/boj/decisionContinuityEvidence"]);
});

test("acquisition accepts exactly the byte ceiling and rejects one byte above", async () => {
  const padded = officialPage + " ".repeat(maxBytes - Buffer.byteLength(officialPage));
  assert.equal(Buffer.byteLength(padded), maxBytes);
  const owner = authority(padded); assert.equal(read(owner, await acquire(owner)).acquiredBodyDigest.byteLength, maxBytes);
  await fails(async () => response(padded + " "), "response-too-large");
});
test("unterminated oversized tag rejects within the bounded lexical scan", async () => {
  await fails(async () => response('<!DOCTYPE html><html lang="en"><head ' + " ".repeat(maxBytes - 100)), "html-layout");
});
test("synchronous parser work exceeding the deadline cannot reach the completion clock", async () => {
  const original = XMLParser.prototype.parse; let clocks = 0, parses = 0, issued: unknown;
  const body = response();
  const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => body, nowUnixMilliseconds: () => { clocks++; return F; }, timeoutMs: 100 });
  try {
    XMLParser.prototype.parse = function (this: XMLParser, ...args: Parameters<typeof original>) {
      if (++parses === 1) { const until = performance.now() + 150; while (performance.now() < until) { /* Finite stalled synchronous parser simulation. */ } }
      return original.apply(this, args);
    } as typeof original;
    await assert.rejects(async () => { issued = await owner.acquire(request()); }, isCode("timeout"));
    assert.ok(parses > 0); assert.equal(clocks, 0); assert.equal(issued, undefined); assert.equal(body.body!.locked, false);
  } finally { XMLParser.prototype.parse = original; }
});
test("parser-internal rejection withholds receipts and leaves the completion clock unsampled", async () => {
  const original = XMLParser.prototype.parse; const defect = new ReferenceError("parser sentinel"); let clocks = 0;
  const owner = createBojContinuityCaptureAuthorityV1({ fetchImpl: async () => response(), nowUnixMilliseconds: () => { clocks++; return F; } });
  try { XMLParser.prototype.parse = () => { throw defect; }; await assert.rejects(owner.acquire(request()), isCode("parser-rejection")); assert.equal(clocks, 0); }
  finally { XMLParser.prototype.parse = original; }
});

for (const markup of ['<meta charset="shift_jis">', '<meta http-equiv="Content-Type" content="text/html;charset=latin1">', '<meta http-equiv="refresh" content="0;url=https://evil.example/">']) {
  test("unsupported shell encoding or refresh declaration: " + markup, async () => fails(async () => response(officialPage.replace("</head>", markup + "</head>")), "content-type"));
}
test("unknown external stylesheet cannot hide an otherwise qualified main", async () => {
  await fails(async () => response(officialPage.replace("</head>", '<link rel="stylesheet" href="https://evil.example/hide.css"></head>')), "html-layout");
});

test("inactive foundation has no production import or caller", () => {
  const result = spawnSync("git", ["grep", "--untracked", "-n", "-e", "bojContinuityCaptureAuthority", "-e", "acquireBojContinuityCaptureV1", "-e", "readBojContinuityCaptureAsKnownAtV1", "--", "src", ":(exclude)src/lib/markets/tests/**", ":(exclude)src/lib/markets/services/bojContinuityCaptureAuthority.ts"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 1, result.stdout || result.stderr);
  assert.equal(result.stdout, ""); assert.equal(result.stderr, "");
});
