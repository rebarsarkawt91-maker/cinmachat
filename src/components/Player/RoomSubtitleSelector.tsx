import UniversalSubtitleSelector, { type UniversalSubtitleSelectorProps } from '../UniversalSubtitleSelector';
import { ROOM_SUBTITLE_LANGUAGES, type RoomSubtitleLanguage } from '../../lib/roomSubtitleCore';

type Props = Omit<UniversalSubtitleSelectorProps, 'value' | 'onChange' | 'languages' | 'includeOff'> & {
  value: string; onChange: (language: RoomSubtitleLanguage) => void;
};

export default function RoomSubtitleSelector({ value, onChange, ...props }: Props) {
  const language = ROOM_SUBTITLE_LANGUAGES.some((item) => item.code === value) ? value as RoomSubtitleLanguage : 'original';
  return <UniversalSubtitleSelector {...props} value={language} includeOff={false} languages={[...ROOM_SUBTITLE_LANGUAGES]}
    onChange={(next) => { if (ROOM_SUBTITLE_LANGUAGES.some((item) => item.code === next)) onChange(next as RoomSubtitleLanguage); }} />;
}
