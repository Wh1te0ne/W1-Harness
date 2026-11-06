/** W1 artwork uses the approved Fold export without changing its paths. */
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { harnessLogo } from './brand-assets.ts'
import styles from './Brand.module.css'

/** @param props - Host-selected dimensions. @returns The approved W1 Fold mark. */
export function OfficialBrandMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <svg className={className} width={size} height={size} viewBox="0 0 512 512" aria-hidden="true"><g fill="currentColor">  <g transform="translate(-692 -585)">
    <path d="M739 717H805Q808 717 810 722L858 853L814 925Z"/>
    <path d="M914 783Q916 783 918 788L945 850L863 982Q860 988 854 988H840Q835 988 833 982L817 935L907 790Q911 783 914 783Z"/>
    <path d="M925 783H989Q996 783 1000 790L1086 974Q1090 983 1082 987Q1080 988 1076 988H1026Q1020 988 1017 982Z"/>
    <path d="M1027 752Q1027 748 1031 745L1068 722L1067 774L1027 798Z"/>
    <path d="M1076 717L1125 686Q1134 680 1134 689L1132 860Q1132 880 1121 900L1092 965L1074 928L1076 905Z"/>
  </g></g></svg>
}

/** @param props - Sidebar size and expanded state. @returns The product lockup or compact family mark. */
export function OfficialSidebarBrandMark({ size, expanded }: SidebarBrandMarkOwnerProps) {
  if (!expanded) return <OfficialBrandMark size={size} />
  return <span className={styles.logo} aria-label={process.env.DSH_CLIENT_TITLE}>
    <img className={styles.light} src={harnessLogo.light} width={harnessLogo.width} height={harnessLogo.height} alt="" />
    <img className={styles.dark} src={harnessLogo.dark} width={harnessLogo.width} height={harnessLogo.height} alt="" />
  </span>
}

/** @returns No separate label; the expanded product logo includes its outlined wordmark. */
export function OfficialBrandName() {
  return null
}
