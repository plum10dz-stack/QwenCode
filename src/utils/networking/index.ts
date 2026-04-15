export * from './http';
export * as auth from './authenticator';
export * from '../channels/broadcast';
// Assuming the export fixes the filename typo
export * from './broadCastProperies';
export * from './AutoHTTP';

// const $fetch = self.fetch;
// export async function fetch(url: RequestInfo | URL, options: RequestInit, s_id: string) {
//     try {

//         return await $fetch(url, {
//             ...options,
//             credentials: 'include',
//             mode: 'cors',
//             headers: {
//                 ...(options.headers || {}),
//                 'S-ID': s_id,
//             },
//         });
//     } catch (error) {
//         throw error;
//     }
// }