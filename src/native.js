import { Capacitor, registerPlugin } from '@capacitor/core';

export const isAndroid = Capacitor.getPlatform() === 'android';
export const Gallery = registerPlugin('Gallery');
export const mediaUrl = uri => Capacitor.convertFileSrc(uri);
