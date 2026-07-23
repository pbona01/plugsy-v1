import React, { useState } from 'react';
import { Trash2, UploadCloud, Save, Loader2, Calendar } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const PlanEditor: React.FC<{ 
  plan: any, 
  onSave: (id: string, data: any) => Promise<void>, 
  onDelete: (id: string) => Promise<void>,
  onReactivate?: (id: string) => Promise<void>
}> = ({ plan, onSave, onDelete, onReactivate }) => {
  const [formData, setFormData] = useState({
    name: plan.name || '',
    price: plan.price || 0,
    discount_price: plan.discount_price || plan.discountPrice || 0,
    discount_expires_at: plan.discount_expires_at || '',
    description: plan.description || '',
    features: plan.features || [],
    image_url: plan.image_url || ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Formatter for datetime-local input (YYYY-MM-DDTHH:mm)
  const formatDateTimeLocal = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      
      // format as YYYY-MM-DDTHH:mm using local time to avoid timezone shifts in the UI
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
      return '';
    }
  };

  const handleUpdateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFeaturesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const array = val.split('\n').filter(line => line.trim() !== '');
    handleUpdateField('features', array);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formDataObj = new FormData();
    formDataObj.append('file', file);
    formDataObj.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: formDataObj,
      });
      const data = await res.json();
      if (data.secure_url) {
        handleUpdateField('image_url', data.secure_url);
        toast.success("Image uploaded!");
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      toast.error("Failed to upload image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const toastId = toast.loading("💾 Saving...");
    try {
      await onSave(plan.id, formData);
      toast.success("✅ Changes Saved!", { id: toastId });
    } catch (err) {
      toast.error("Failed to save changes", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`card-premium p-10 group relative transition-all hover:scale-[1.02] bg-brand-surface space-y-6 border ${plan.is_active === false ? 'opacity-60 border-red-500/30' : 'border-brand-border'}`}>
      <div className="absolute top-3 right-3 flex items-center gap-2">
         {plan.is_active === false && (
           <span className="text-[9px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-md">Deactivated</span>
         )}
         <button onClick={() => onDelete(plan.id)} className="p-3 bg-brand-surface border border-brand-border rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-lg"><Trash2 size={16} /></button>
      </div>

      <div className="pt-4">
        <label className="text-[8px] font-black uppercase tracking-widest text-brand-text-secondary block mb-1">Product Name</label>
        <input 
          type="text" 
          value={formData.name}
          onChange={e => handleUpdateField('name', e.target.value)}
          className="bg-transparent font-black tracking-tighter text-2xl uppercase border-b border-brand-border w-full text-brand-text focus:border-brand-accent p-2"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[8px] font-black uppercase tracking-widest text-brand-text-secondary block mb-1">Base Price (₦)</label>
          <input 
            type="number" 
            value={formData.price}
            onChange={e => handleUpdateField('price', Number(e.target.value))}
            className="bg-transparent font-black tracking-tighter text-xl uppercase border-b border-brand-border w-full text-brand-text focus:border-brand-accent p-2"
          />
        </div>
        <div>
          <label className="text-[8px] font-black uppercase tracking-widest text-brand-text-secondary block mb-1">Discount Price (₦)</label>
          <input 
            type="number" 
            value={formData.discount_price}
            onChange={e => handleUpdateField('discount_price', Number(e.target.value))}
            className="bg-transparent font-black tracking-tighter text-xl uppercase border-b border-brand-border w-full text-brand-accent focus:border-brand-accent p-2"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[8px] font-black uppercase tracking-widest text-brand-text-secondary block mb-1">Discount Expiry (Leave empty for no expiry)</label>
          <input 
            type="datetime-local" 
            value={formatDateTimeLocal(formData.discount_expires_at)}
            onChange={e => handleUpdateField('discount_expires_at', e.target.value)}
            className="bg-brand-text/5 border border-brand-border rounded-lg w-full text-sm p-3"
          />
        </div>
      </div>
      
      <div>
        <label className="text-[8px] font-black uppercase tracking-widest text-brand-text-secondary block mb-1">Description</label>
        <textarea 
          value={formData.description}
          onChange={e => handleUpdateField('description', e.target.value)}
          className="bg-brand-text/5 border border-brand-border rounded-lg w-full text-sm p-3 min-h-[80px]"
          placeholder="Product description"
        />
      </div>

      <div>
        <label className="text-[8px] font-black uppercase tracking-widest text-brand-text-secondary block mb-1">Features (One per line)</label>
        <textarea 
          value={Array.isArray(formData.features) ? formData.features.join('\n') : ''}
          onChange={handleFeaturesChange}
          className="bg-brand-text/5 border border-brand-border rounded-lg w-full text-sm p-3 min-h-[100px]"
          placeholder="Feature 1&#10;Feature 2"
        />
      </div>

      <div>
        <label className="text-[8px] font-black uppercase tracking-widest text-brand-text-secondary block mb-1">Product Image</label>
        {formData.image_url && (
           <img src={formData.image_url} alt="Product" className="w-full h-32 object-cover rounded-lg mb-2" />
        )}
        <div className="relative border-2 border-dashed border-brand-border rounded-xl p-4 text-center hover:border-brand-accent transition-colors">
           <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleImageUpload} disabled={isUploading} />
           {isUploading ? <Loader2 className="animate-spin mx-auto text-brand-accent" /> : <UploadCloud className="mx-auto text-brand-text-secondary" />}
           <p className="text-[10px] font-black uppercase tracking-widest text-brand-text-secondary mt-2">Upload Image</p>
        </div>
      </div>

      {plan.is_active === false && onReactivate && (
        <button 
          onClick={() => onReactivate(plan.id)}
          className="w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all bg-blue-500 hover:bg-blue-600 border border-transparent text-white shadow-lg shadow-blue-500/20 flex justify-center items-center gap-2 mt-2"
        >
          Reactivate Product
        </button>
      )}

      <button 
        onClick={handleSave}
        disabled={isSaving}
        className="w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all bg-green-500 border border-transparent text-white shadow-lg shadow-green-500/20 flex justify-center items-center gap-2"
      >
        {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
        Save Changes
      </button>
    </div>
  );
}
