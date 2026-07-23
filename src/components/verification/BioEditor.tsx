import React, { useState } from 'react';
import { Type, Video, Image as ImageIcon, Loader2 } from 'lucide-react';
import { compressAndUpload } from '../../utils/uploadMedia';
import { VideoUploader } from './VideoUploader';
import { showToast } from '../Toast';

export function BioEditor({ 
  type, 
  text, 
  videoUrl, 
  graphicUrl,
  onChange 
}: { 
  type: 'text' | 'video' | 'graphic',
  text: string,
  videoUrl: string,
  graphicUrl: string,
  onChange: (updates: any) => void 
}) {
  const [uploading, setUploading] = useState(false);

  const handleGraphicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await compressAndUpload(file);
      onChange({ bio_graphic_url: url, bio_type: 'graphic' });
    } catch (err: any) {
      showToast("Filter upload failed: " + err.message, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mb-8">
      <label className="block text-sm font-bold text-gray-900 mb-4">Bio Strategy</label>
      
      <div className="flex bg-gray-100 p-1 rounded-xl mb-4 w-fit">
        <button 
          onClick={() => onChange({ bio_type: 'text' })}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${type === 'text' ? 'bg-brand-bg text-black shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
        >
          <Type size={16} /> Text
        </button>
        <button 
          onClick={() => {}}
          className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${type === 'video' ? 'bg-brand-bg text-black shadow-sm' : 'text-gray-400 cursor-not-allowed opacity-70'}`}
        >
          <Video size={16} /> Video
          <span className="absolute -top-2 -right-2 bg-gray-300 text-gray-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shadow-sm z-10 hidden sm:block border border-gray-100">Soon</span>
        </button>
        <button 
          onClick={() => onChange({ bio_type: 'graphic' })}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${type === 'graphic' ? 'bg-brand-bg text-black shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
        >
          <ImageIcon size={16} /> Graphic
        </button>
      </div>

      <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
        {type === 'text' && (
          <div>
            <textarea
              value={text || ''}
              onChange={(e) => onChange({ bio_text: e.target.value.slice(0, 400) })}
              placeholder="Tell your story. Keep it brief and focused on what you do."
              className="w-full bg-brand-bg border border-brand-border rounded-xl p-4 min-h-[120px] focus:ring-2 focus:ring-black outline-none transition"
            />
            <div className="text-right text-xs text-gray-400 mt-2 font-medium">
              {(text || '').length}/400
            </div>
          </div>
        )}

        {type === 'video' && (
          <div>
            <VideoUploader 
              onUpload={(videoId) => {
                onChange({ bio_video_url: videoId });
              }}
              onClear={() => {
                onChange({ bio_video_url: '' });
              }}
              existingVideoId={videoUrl}
              workTitle="Intro Video"
              workDescription="Biography presentation video"
            />
          </div>
        )}

        {type === 'graphic' && (
          <div>
            {graphicUrl ? (
              <div className="relative group">
                <img src={graphicUrl || undefined} alt="Bio graphic" className="w-full max-w-sm rounded-xl border border-brand-border" />
                <button
                  onClick={() => onChange({ bio_graphic_url: '' })}
                  className="absolute top-2 right-2 bg-white/90 text-red-500 px-3 py-1 text-sm rounded-lg font-medium opacity-0 group-hover:opacity-100 transition shadow-sm"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-brand-border rounded-xl p-8 text-center bg-brand-bg">
                {uploading ? (
                  <div className="flex flex-col items-center justify-center py-4">
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin mb-2" />
                    <p className="text-sm text-gray-500 font-medium">Optimizing high-res media asset...</p>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                    <label className="cursor-pointer bg-brand-bg border border-brand-border px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition inline-block mb-2">
                      Select Graphic
                      <input type="file" className="hidden" accept="image/*" onChange={handleGraphicUpload} />
                    </label>
                    <p className="text-xs text-gray-400">JPG, PNG, WebP up to 5MB.</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
