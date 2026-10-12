const BASE=(import.meta.env.VITE_API_URL as string|undefined)?.replace(/\/$/,'')??(import.meta.env.PROD?'/api':'http://localhost:4000/v1');
async function api<T>(path:string,options:RequestInit={}):Promise<T>{const method=(options.method??'GET').toUpperCase();const headers=new Headers(options.headers);headers.set('Content-Type','application/json');if(!['GET','HEAD','OPTIONS'].includes(method))headers.set('X-XTRIM-Request','1');const response=await fetch(`${BASE}${path}`,{...options,credentials:'include',headers});if(response.status===401&&!window.location.pathname.startsWith('/login')){window.location.replace('/login');throw new Error('Your session expired. Please sign in again.')}if(!response.ok){const body=await response.json().catch(()=>({})) as {message?:string;fields?:Record<string,string[]|undefined>};const fieldMessage=body.fields&&Object.values(body.fields).flat().find(Boolean);throw new Error(fieldMessage||body.message||`Request failed (${response.status})`)}if(response.status===204)return undefined as T;return response.json() as Promise<T>}

export type MemberUser={id:string;role:'MEMBER'|'COACH';memberNumber?:string;coachNumber?:string;firstName:string;lastName:string;mustChangePassword:boolean};
export type Membership={id:string;plan:string;status:'ACTIVE'|'PAUSED'|'CANCELLED'|'EXPIRED';pricePaid:number;startedAt:string;expiresAt:string;pausedAt?:string;statusChangedAt?:string;statusReason?:string};
export type MemberCard={id?:string;maskedUid:string;status:'ACTIVE'|'REVOKED'|'LOST'|'REPLACED';assignedAt:string;revokedAt?:string};
export type MemberRequest={id:string;type:'RENEWAL'|'PROFILE_CORRECTION'|'NFC_LOST';status:'OPEN'|'RESOLVED'|'CANCELLED';message:string;requestedChanges?:Record<string,unknown>;resolutionNote?:string;createdAt:string;resolvedAt?:string};
export type HomeData={membership:Membership|null;card:MemberCard|null;gym:{isOpen:boolean;statusLabel:string;hoursToday:string;scheduleSource:string};attendanceSummary:{totalVisits:number;visitsThisMonth:number;lastVisitAt?:string;today:{id:string;status:'CHECKED_IN'|'CHECKED_OUT';checkedInAt:string;checkedOutAt?:string}|null};announcements:Array<{id:string;title:string;message:string;publishedAt:string}>;openRequests:MemberRequest[]};
export type MemberPayment={id:string;reference:string;type:string;status:'COMPLETED'|'VOID';amount:number;method:string;receivedAt:string};
export type MemberReceipt={id:string;reference:string;type:string;status:'COMPLETED'|'VOID';amountDue:number;planAmount:number;membershipFee:number;amountReceived:number;change:number;method:string;receivedAt:string;receivedBy:string;voidedAt?:string;voidReason?:string};
export type AttendanceItem={id:string;attendanceDate:string;checkedInAt:string;checkedOutAt?:string;status:'CHECKED_IN'|'CHECKED_OUT';checkInMethod:'NFC'|'MANUAL';checkOutMethod?:'NFC'|'MANUAL';station:string};
export type CoachItem={id:string;fullName:string;specialties:string[];availabilitySchedule:Array<{day:string;startTime:string;endTime:string}>};
export type MemberProfile={id:string;memberNumber:string;firstName:string;lastName:string;phone:string;email:string;birthDate?:string;emergencyContact?:{name?:string;relationship?:string;phone?:string};memberType:'STUDENT'|'REGULAR';studentVerified:boolean;username:string;lastLoginAt?:string};
export type MemberNotification={id:string;type:string;tone:'INFO'|'ACTION'|'WARNING';title:string;message:string;actionUrl?:string;readAt?:string;createdAt:string};
export type SessionInfo={id:string;current:boolean;userAgent:string;lastSeenAt:string;createdAt:string;expiresAt:string};
export type CoachOverview={coach:{coachNumber:string;fullName:string;specialty:string;availability:string};gym:{hoursToday:string};attendance:Array<{id:string;attendanceDate:string;checkedInAt:string;checkedOutAt?:string}>};

export const memberApi={
 me:()=>api<MemberUser>('/auth/me'), logout:()=>api<void>('/auth/logout',{method:'POST'}),
 changeTemporaryPassword:(currentPassword:string,newPassword:string)=>api<void>('/auth/first-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})}),
 home:()=>api<HomeData>('/member/home'),
 memberships:(page=1)=>api<{current:Membership|null;page:number;limit:number;total:number;pages:number;items:Membership[]}>(`/member/memberships?page=${page}`),
 payments:(page=1)=>api<{page:number;limit:number;total:number;pages:number;items:MemberPayment[]}>(`/member/payments?page=${page}`),
 receipt:(id:string)=>api<MemberReceipt>(`/member/payments/${id}`),
 attendance:(input:{page?:number;from?:string;to?:string}={})=>{const query=new URLSearchParams();Object.entries(input).forEach(([key,value])=>{if(value)query.set(key,String(value))});return api<{summary:{totalVisits:number;visitsThisMonth:number};page:number;limit:number;total:number;pages:number;items:AttendanceItem[]}>(`/member/attendance?${query}`)},
 card:()=>api<{card:MemberCard|null}>('/member/card'), reportCardLost:(reason:string)=>api<{requestId:string;status:'LOST'}>('/member/card/report-lost',{method:'POST',body:JSON.stringify({reason})}),
 profile:()=>api<MemberProfile>('/member/profile'), requests:()=>api<{items:MemberRequest[]}>('/member/requests'),
 requestRenewal:(message:string)=>api<MemberRequest>('/member/requests/renewal',{method:'POST',body:JSON.stringify({message})}),
 requestProfileCorrection:(input:{message:string;phone?:string;email?:string;emergencyContact?:{name:string;relationship:string;phone:string}})=>api<MemberRequest>('/member/requests/profile-correction',{method:'POST',body:JSON.stringify(input)}),
 coaches:()=>api<{items:CoachItem[]}>('/member/coaches'),
 notifications:()=>api<{unread:number;items:MemberNotification[]}>('/member/notifications'), readNotification:(id:string)=>api<MemberNotification>(`/member/notifications/${id}/read`,{method:'PATCH'}), readAllNotifications:()=>api<void>('/member/notifications/read-all',{method:'PATCH'}), deleteNotification:(id:string)=>api<void>(`/member/notifications/${id}`,{method:'DELETE'}), clearReadNotifications:()=>api<void>('/member/notifications/read',{method:'DELETE'}),
 updatePassword:(currentPassword:string,newPassword:string)=>api<void>('/auth/password',{method:'PUT',body:JSON.stringify({currentPassword,newPassword})}),
 sessions:()=>api<{items:SessionInfo[]}>('/auth/sessions'), revokeOtherSessions:()=>api<{revoked:number}>('/auth/sessions/others',{method:'DELETE'}),
 coachOverview:()=>api<CoachOverview>('/coach/overview'),
};
