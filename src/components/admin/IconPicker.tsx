import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as LucideIcons from 'lucide-react';
import { Search, X, Star } from 'lucide-react';

// Pełna lista nazw ikon lucide-react (hardcoded — ESM namespace nie daje się enumerować w Vite)
const LUCIDE_ICON_NAMES: string[] = [
  'Activity','Airplay','AlertCircle','AlertOctagon','AlertTriangle',
  'AlignCenter','AlignJustify','AlignLeft','AlignRight','Anchor',
  'Annoyed','Aperture','Archive','ArchiveRestore','ArchiveX',
  'ArrowBigDown','ArrowBigLeft','ArrowBigRight','ArrowBigUp',
  'ArrowDown','ArrowDownCircle','ArrowDownLeft','ArrowDownRight',
  'ArrowLeft','ArrowLeftCircle','ArrowRight','ArrowRightCircle',
  'ArrowUp','ArrowUpCircle','ArrowUpLeft','ArrowUpRight',
  'AtSign','Award','Axe','Baby','Banana','BatteryCharging','Battery',
  'Bed','Bell','BellOff','BellRing','Bike','Binary','Bird','Bitcoin',
  'Bluetooth','BluetoothConnected','BluetoothOff','Bold','Book',
  'BookCopy','BookMarked','BookMinus','BookOpen','BookPlus','BookText',
  'BookX','Bookmark','BookmarkCheck','BookmarkMinus','BookmarkPlus',
  'BookmarkX','Bot','Box','BoxSelect','Boxes','Braces','Brackets',
  'Brain','Briefcase','BrushCleaning','Bug','Building','Building2',
  'Bus','Calculator','Calendar','CalendarCheck','CalendarClock',
  'CalendarDays','CalendarHeart','CalendarMinus','CalendarOff',
  'CalendarPlus','CalendarRange','CalendarX','Camera','CameraOff',
  'Car','CarFront','CarTaxiFront','Cast','Cat','Check','CheckCheck',
  'CheckCircle','CheckCircle2','CheckSquare','ChevronDown','ChevronFirst',
  'ChevronLast','ChevronLeft','ChevronRight','ChevronUp',
  'ChevronsDown','ChevronsLeft','ChevronsLeftRight','ChevronsRight',
  'ChevronsUp','ChevronsUpDown','Chrome','Circle','CircleDot',
  'Citrus','Clapperboard','Clipboard','ClipboardCheck','ClipboardCopy',
  'ClipboardList','ClipboardPaste','ClipboardX','Clock','Cloud',
  'CloudCog','CloudDrizzle','CloudFog','CloudHail','CloudLightning',
  'CloudMoon','CloudOff','CloudRain','CloudRainWind','CloudSnow',
  'CloudSun','Code','Code2','Codepen','Codesandbox','Coffee','Cog',
  'Coins','Columns','Command','Compass','Construction','Contact',
  'Copy','Copyright','CreditCard','Crop','Cross','Crosshair','Crown',
  'Cuboid','Currency','Database','DatabaseBackup','Delete','Disc',
  'Disc2','Disc3','Dog','DollarSign','Download','Drama','Droplet',
  'Droplets','Dumbbell','Edit','Edit2','Edit3','Egg','EggFried',
  'Equal','EqualNot','Eraser','ExternalLink','Eye','EyeOff',
  'Facebook','Factory','Fan','FastForward','Feather','File',
  'FileArchive','FileAudio','FileAxis3d','FileBadge','FileBarChart',
  'FileBarChart2','FileBox','FileCheck','FileCheck2','FileCode',
  'FileCode2','FileCog','FileDown','FileHeart','FileImage','FileJson',
  'FileJson2','FileKey','FileKey2','FileLock','FileLock2',
  'FileMinus','FileMinus2','FileOutput','FilePieChart','FilePlus',
  'FilePlus2','FileQuestion','FileScan','FileSearch','FileSearch2',
  'FileSpreadsheet','FileStack','FileSymlink','FileTerminal',
  'FileText','FileType','FileType2','FileUp','FileVideo','FileVideo2',
  'FileWarning','FileX','FileX2','Files','Filter','Fingerprint',
  'Fish','Flag','Flame','Flashlight','FlashlightOff','FlipHorizontal',
  'FlipHorizontal2','FlipVertical','FlipVertical2','Flower',
  'Flower2','Focus','FoldHorizontal','FoldVertical','Folder',
  'FolderArchive','FolderCheck','FolderClock','FolderClosed',
  'FolderCog','FolderDot','FolderDown','FolderGit','FolderGit2',
  'FolderHeart','FolderInput','FolderKanban','FolderKey','FolderLock',
  'FolderMinus','FolderOpen','FolderOpenDot','FolderOutput',
  'FolderPen','FolderPlus','FolderRoot','FolderSearch','FolderSearch2',
  'FolderSymlink','FolderSync','FolderTree','FolderUp','FolderX',
  'Folders','Footprints','Forklift','Frame','Framer','Frown',
  'Fuel','Gamepad','Gamepad2','GaugeCircle','Gauge','Gift',
  'GiftIcon','GitBranch','GitBranchPlus','GitCommit','GitFork',
  'GitMerge','GitPullRequest','GitPullRequestClosed','Globe',
  'Globe2','GraduationCap','Grid','Grip','GripHorizontal',
  'GripVertical','Group','Hammer','HardDrive','HardHat','Hash',
  'Headphones','Heart','HeartCrack','HeartHandshake','HeartOff',
  'HeartPulse','HelpCircle','Hexagon','Highlighter','Home',
  'Hospital','Hotel','Hourglass','Image','ImageOff','ImagePlus',
  'Inbox','IndentDecrease','IndentIncrease','Infinity','Info',
  'Instagram','Italic','Joystick','Key','KeyRound','KeySquare',
  'Keyboard','Lamp','LampCeiling','LampDesk','LampFloor',
  'LaptopMinimal','Layers','Layout','Leaf','LifeBuoy','Lightbulb',
  'LightbulbOff','LineChart','Link','Link2','Link2Off','LinkIcon',
  'List','ListChecks','ListFilter','ListMinus','ListMusic',
  'ListOrdered','ListPlus','ListRestart','ListTodo','ListTree',
  'ListVideo','ListX','Loader','Loader2','Lock','LockKeyhole',
  'LogIn','LogOut','Luggage','Magnet','Mail','MailCheck','MailMinus',
  'MailOpen','MailPlus','MailQuestion','MailSearch','MailWarning',
  'MailX','Map','MapPin','MapPinOff','MapPinned','Maximize',
  'Maximize2','Medal','Menu','MessageCircle','MessageSquare',
  'Mic','MicOff','Microscope','Minimize','Minimize2','Minus',
  'MixerHorizontal','MixerVertical','Monitor','Moon','MoreHorizontal',
  'MoreVertical','Mountain','MountainSnow','Mouse','MousePointer',
  'MousePointer2','MousePointerClick','Move','Music','Music2',
  'Music3','Music4','Navigation','Navigation2','Network','Newspaper',
  'Nut','Octagon','Option','Orbit','Package','Package2','PackageCheck',
  'PackageMinus','PackageOpen','PackagePlus','PackageSearch','PackageX',
  'PaintBucket','Paintbrush','Palmtree','Paperclip','ParkingMeter',
  'PauseCircle','Pause','PenLine','Pen','Pencil','PenTool',
  'Percent','PersonStanding','Phone','PhoneCall','PhoneForwarded',
  'PhoneIncoming','PhoneMissed','PhoneOff','PhoneOutgoing',
  'PieChart','PiggyBank','Pill','Pin','PinOff','Plane','PlaneLanding',
  'PlaneTakeoff','Play','PlayCircle','Plug','PlugZap','Plus',
  'PlusCircle','PlusSquare','Pocket','PocketKnife','Podcast',
  'Power','PowerOff','Printer','Projector','Puzzle','QrCode',
  'Quote','Radio','RadioReceiver','Rainbow','Rat','Ratio',
  'Receipt','RefreshCcw','RefreshCw','Regex','Repeat','Repeat1',
  'Repeat2','Replace','ReplaceAll','Reply','ReplyAll','Rewind',
  'Rocket','RotateCcw','RotateCw','Route','Rss','Ruler','Save',
  'SaveAll','Scale','Scan','ScanLine','School','Scissors','Search',
  'Send','SendHorizonal','Server','Settings','Share','Share2',
  'Sheet','Shield','ShieldAlert','ShieldCheck','ShieldOff',
  'ShoppingBag','ShoppingCart','Shuffle','Signal','SignalHigh',
  'SignalLow','SignalMedium','SignalZero','SkipBack','SkipForward',
  'Skull','Slack','Slash','Sliders','SlidersHorizontal','Smile',
  'Smartphone','Snowflake','SortAsc','SortDesc','Soup','Speaker',
  'Spline','Square','Star','StarHalf','StarOff','StepBack',
  'StepForward','Stethoscope','Sticker','StickyNote','StopCircle',
  'StretchHorizontal','StretchVertical','Sun','SunDim','Sunrise',
  'Sunset','SwatchBook','Swords','Table','Table2','Tablet',
  'Tag','Tags','Target','Terminal','Thermometer','ThumbsDown',
  'ThumbsUp','Ticket','Timer','TimerOff','TimerReset','ToggleLeft',
  'ToggleRight','Tool','Tornado','Tractor','TrafficCone','Train',
  'Trash','Trash2','TreeDeciduous','TreePine','TrendingDown',
  'TrendingUp','Triangle','Trophy','Truck','Tv','Twitter','Type',
  'Umbrella','Underline','Undo','Undo2','UndoDot','Unlink',
  'Unlink2','Unlock','Upload','User','UserCheck','UserCog',
  'UserMinus','UserPlus','UserX','Users','Users2','UtensilsCrossed',
  'Utensils','Video','VideoOff','View','Voicemail','Volume',
  'Volume1','Volume2','VolumeX','Wallet','Watch','Waves','Webcam',
  'Wifi','WifiOff','Wind','WrapText','X','XCircle','XOctagon',
  'XSquare','Youtube','Zap','ZapOff','ZoomIn','ZoomOut',
].sort();

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
}

const IconPicker: React.FC<IconPickerProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matchingNames = useMemo<string[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return LUCIDE_ICON_NAMES;
    return LUCIDE_ICON_NAMES.filter(name => name.toLowerCase().includes(q));
  }, [search]);

  const visibleIcons = matchingNames.slice(0, 160);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearch('');
    }
  }, [open]);

  const renderIcon = (name: string, className = 'w-4 h-4') => {
    const Icon = (LucideIcons as Record<string, unknown>)[name] as React.FC<{ className?: string }> | undefined;
    if (!Icon) return <Star className={className} />;
    return <Icon className={className} />;
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Przycisk otwierający */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-lg text-white text-sm hover:border-gray-400 transition-colors w-full"
      >
        {renderIcon(value)}
        <span className="flex-1 text-left text-gray-300 truncate">{value || 'Wybierz ikonę'}</span>
        <Search className="w-3.5 h-3.5 text-gray-100 flex-shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-80 bg-[#1e1e1e] border border-[#3d3d3d] rounded-xl shadow-2xl p-3 left-0">
          {/* Wyszukiwarka */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-100 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj... (np. car, home, star)"
              className="w-full pl-8 pr-8 py-2 bg-[#1e1e1e] border border-[#3d3d3d] rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setSearch(''); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-100 hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <p className="text-xs text-gray-100 mb-2">
            {search.trim()
              ? `Znaleziono: ${matchingNames.length} (pokazano: ${visibleIcons.length})`
              : `Wszystkich: ${LUCIDE_ICON_NAMES.length} (pokazano: ${visibleIcons.length})`
            }
          </p>

          {/* Siatka ikon */}
          <div className="grid grid-cols-8 gap-1 max-h-64 overflow-y-auto pr-1">
            {visibleIcons.map(name => {
              const isSelected = name === value;
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onMouseDown={e => {
                    e.preventDefault();
                    onChange(name);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`p-2 rounded-lg flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-[#272727] text-gray-300 hover:text-white'
                  }`}
                >
                  {renderIcon(name)}
                </button>
              );
            })}
          </div>

          {visibleIcons.length === 0 && (
            <p className="text-center text-gray-100 text-sm py-4">
              Brak wyników dla &quot;{search}&quot;
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default IconPicker;
