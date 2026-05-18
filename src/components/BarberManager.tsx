// src/components/BarberManager.tsx
import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, RotateCcw, X, AlertCircle, Edit2, Camera, Upload, MoreHorizontal } from 'lucide-react';

interface Barber {
  id: string;
  name: string;
  photo: string;
}

interface DeletedBarber {
  id: string;
  name: string;
  photo: string;
  user_id: string;
  deleted_at: string;
}

interface BarberManagerProps {
  userId: string;
  onSelect: (barber: Barber | null) => void;
  selectedBarberName?: string | null;
}

// Modal Portal pour empêcher le scroll
function ModalPortal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// Composant pour l'upload de photo
function PhotoUpload({ photo, onPhotoChange, isEditing = false }: { photo: string | null; onPhotoChange: (file: File | null) => void; isEditing?: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(photo);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      onPhotoChange(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const displayImage = preview || photo;

  return (
    <div className="flex flex-col items-center gap-3">
      <div onClick={handleClick} className="relative cursor-pointer group">
        {displayImage ? (
          <div className="relative">
            <img src={displayImage} alt="Photo" className="w-28 h-28 rounded-full object-cover border-4 border-zinc-600 group-hover:border-white transition-all" />
            <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
              <Camera className="w-8 h-8 text-white" />
            </div>
          </div>
        ) : (
          <div className="w-28 h-28 rounded-full bg-zinc-800 border-4 border-dashed border-zinc-600 group-hover:border-white transition-all flex flex-col items-center justify-center gap-1">
            <Upload className="w-8 h-8 text-zinc-500 group-hover:text-white transition-all" />
            <span className="text-xs text-zinc-500 group-hover:text-white">Ajouter photo</span>
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      {isEditing && displayImage && (
        <button onClick={() => { onPhotoChange(null); setPreview(null); }} className="text-xs text-red-400 hover:text-red-300 transition">
          Supprimer la photo
        </button>
      )}
    </div>
  );
}

export function BarberManager({ userId, onSelect, selectedBarberName }: BarberManagerProps) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [deletedBarbers, setDeletedBarbers] = useState<DeletedBarber[]>([]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Barber | null>(null);
  const [newName, setNewName] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [addPhotoPreview, setAddPhotoPreview] = useState<string | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);

  const mounted = useRef(true);
  const menuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchBarbers = async () => {
    const { data, error } = await supabase
      .from('barbers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (!error && data && mounted.current) setBarbers(data);
  };

  const fetchDeletedBarbers = async () => {
    const { data, error } = await supabase
      .from('deleted_barbers')
      .select('*')
      .eq('user_id', userId)
      .order('deleted_at', { ascending: false });
    if (!error && data && mounted.current) setDeletedBarbers(data);
  };

  useEffect(() => {
    fetchBarbers();
    fetchDeletedBarbers();
  }, [userId]);

  const handleAddBarber = async () => {
    if (!newName.trim()) {
      setValidationError('Le nom du coiffeur est obligatoire.');
      return;
    }
    if (!newFile) {
      setValidationError('Veuillez sélectionner une photo.');
      return;
    }
    setValidationError('');

    setIsUploading(true);
    try {
      const fileName = `${userId}/${Date.now()}-${newFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('barbers')
        .upload(fileName, newFile);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('barbers').getPublicUrl(fileName);
      const { error: insertError } = await supabase
        .from('barbers')
        .insert([{ name: newName.trim(), photo: data.publicUrl, user_id: userId }]);
      if (insertError) throw insertError;
      await fetchBarbers();
      if (mounted.current) {
        setAdding(false); 
        setNewName(''); 
        setNewFile(null);
        setAddPhotoPreview(null);
        setValidationError('');
      }
    } catch (error) {
      console.error('Erreur ajout coiffeur:', error);
      alert('Erreur lors de l\'ajout du coiffeur');
    } finally {
      if (mounted.current) setIsUploading(false);
    }
  };

  const handleEditBarber = async () => {
    if (!editing) return;
    
    if (!newName.trim()) {
      setValidationError('Le nom du coiffeur est obligatoire.');
      return;
    }
    setValidationError('');

    setIsUploading(true);
    try {
      let photoUrl = editing.photo;
      
      if (newFile) {
        const fileName = `${userId}/${editing.id}/${Date.now()}-${newFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('barbers')
          .upload(fileName, newFile);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('barbers').getPublicUrl(fileName);
        photoUrl = data.publicUrl;
      }
      
      const { error: updateError } = await supabase
        .from('barbers')
        .update({ name: newName.trim(), photo: photoUrl })
        .eq('id', editing.id);
      
      if (updateError) throw updateError;
      
      await fetchBarbers();
      if (mounted.current) {
        setEditing(null);
        setNewName('');
        setNewFile(null);
        setEditPhotoPreview(null);
        setValidationError('');
      }
    } catch (error) {
      console.error('Erreur modification coiffeur:', error);
      alert('Erreur lors de la modification du coiffeur');
    } finally {
      if (mounted.current) setIsUploading(false);
    }
  };

  const handleDeleteBarber = async (barberId: string, photoUrl: string, barberName: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer ${barberName} ?`)) return;
    try {
      const { error: insertDeletedError } = await supabase
        .from('deleted_barbers')
        .insert([{ 
          id: barberId, 
          name: barberName, 
          photo: photoUrl,
          user_id: userId 
        }]);
      
      if (insertDeletedError) throw insertDeletedError;

      const { error } = await supabase.from('barbers').delete().eq('id', barberId);
      if (error) throw error;
      
      if (mounted.current) {
        setBarbers(barbers.filter((b) => b.id !== barberId));
        await fetchDeletedBarbers();
        setActiveMenuId(null);
      }
    } catch (error) {
      console.error('Erreur suppression coiffeur:', error);
      alert('Erreur lors de la suppression du coiffeur');
    }
  };

  const handleRestoreBarber = async (deletedBarber: DeletedBarber) => {
    if (!confirm(`Restaurer ${deletedBarber.name} ?`)) return;
    try {
      const { error: restoreError } = await supabase
        .from('barbers')
        .insert([{ 
          id: deletedBarber.id, 
          name: deletedBarber.name, 
          photo: deletedBarber.photo,
          user_id: userId 
        }]);
      
      if (restoreError) throw restoreError;
      
      const { error: deleteError } = await supabase
        .from('deleted_barbers')
        .delete()
        .eq('id', deletedBarber.id);
      
      if (deleteError) throw deleteError;
      
      await fetchBarbers();
      await fetchDeletedBarbers();
    } catch (error) {
      console.error('Erreur restauration coiffeur:', error);
      alert('Erreur lors de la restauration');
    }
  };

  const openEditModal = (barber: Barber) => {
    setEditing(barber);
    setNewName(barber.name);
    setNewFile(null);
    setEditPhotoPreview(null);
    setValidationError('');
    setActiveMenuId(null);
  };

  const handleSelectBarber = (barber: Barber) => {
    onSelect(barber);
  };

  const BarberItem = ({ barber }: { barber: Barber }) => {
    const isSelected = selectedBarberName === barber.name;
    const isMenuOpen = activeMenuId === `barber-${barber.id}`;

    return (
      <div className="relative text-center group">
        <div className="relative inline-block">
          <div
            onClick={() => handleSelectBarber(barber)}
            className={`w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full mb-2 transition-all cursor-pointer ${
              isSelected
                ? 'ring-4 ring-green-500 ring-offset-2 ring-offset-black scale-110'
                : 'hover:scale-105'
            }`}
          >
            <img src={barber.photo} alt={barber.name} className="w-full h-full rounded-full object-cover border-2 border-zinc-700" />
          </div>
          
          <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2" ref={isMenuOpen ? menuRef : null}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuId(isMenuOpen ? null : `barber-${barber.id}`);
              }}
              className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors shadow-lg border border-zinc-700"
            >
              <MoreHorizontal className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400" />
            </button>
            
            {isMenuOpen && (
              <div className="absolute top-full right-0 mt-2 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-1 z-10 min-w-[100px]">
                <button onClick={() => { openEditModal(barber); }} className="w-full text-left px-3 py-1.5 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2">
                  <Edit2 className="w-3 h-3" /> Modifier
                </button>
                <button onClick={() => { handleDeleteBarber(barber.id, barber.photo, barber.name); }} className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 rounded-md transition flex items-center gap-2">
                  <Trash2 className="w-3 h-3" /> Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
        <span className={`block text-sm font-medium ${isSelected ? 'text-green-400' : 'text-gray-300'}`}>
          {barber.name}
        </span>
      </div>
    );
  };

  const handleAddPhotoChange = (file: File | null) => {
    setNewFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAddPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setAddPhotoPreview(null);
    }
  };

  const handleEditPhotoChange = (file: File | null) => {
    setNewFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setEditPhotoPreview(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4 items-center">
        {barbers.map((barber) => (
          <BarberItem key={barber.id} barber={barber} />
        ))}
        <div onClick={() => setAdding(true)} className="flex flex-col justify-center items-center w-20 h-20 sm:w-24 sm:h-24 border-2 border-dashed border-zinc-600 rounded-full cursor-pointer text-gray-400 hover:text-white hover:border-white hover:scale-105 transition-all">
          <Plus className="w-6 h-6 sm:w-8 sm:h-8 mb-1" />
          <span className="text-xs">Ajouter</span>
        </div>
      </div>

      {deletedBarbers.length > 0 && (
        <div className="border-t border-zinc-800 pt-4">
          <button onClick={() => setShowDeleted(!showDeleted)} className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 mb-3">
            {showDeleted ? '▼' : '▶'} Coiffeurs supprimés ({deletedBarbers.length})
          </button>
          {showDeleted && (
            <div className="flex flex-wrap gap-4">
              {deletedBarbers.map((deleted) => (
                <div key={deleted.id} className="relative text-center group">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full mb-2">
                    <img src={deleted.photo} alt={deleted.name} className="w-full h-full rounded-full object-cover border-2 border-zinc-700 opacity-60" />
                  </div>
                  <span className="block text-sm text-gray-500">{deleted.name}</span>
                  <button onClick={() => handleRestoreBarber(deleted)} className="absolute -top-2 -right-2 bg-green-500 hover:bg-green-600 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all">
                    <RotateCcw className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {adding && (
        <ModalPortal onClose={() => setAdding(false)}>
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6 border border-zinc-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Ajouter un coiffeur</h3>
              <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-5">
              <PhotoUpload photo={addPhotoPreview} onPhotoChange={handleAddPhotoChange} />
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Nom du coiffeur <span className="text-red-400">*</span></label>
                <input type="text" placeholder="Ex: Jean Dupont" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition-colors" autoFocus />
              </div>
              {validationError && (<div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 p-3 rounded-xl"><AlertCircle className="w-4 h-4" /><span>{validationError}</span></div>)}
              <div className="flex gap-3 pt-4">
                <button onClick={handleAddBarber} disabled={isUploading || !newFile || !newName.trim()} className="flex-1 bg-white text-black py-3 rounded-xl font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                  {isUploading ? 'Ajout en cours...' : 'Ajouter'}
                </button>
                <button onClick={() => { setAdding(false); setNewName(''); setNewFile(null); setAddPhotoPreview(null); setValidationError(''); }} className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-semibold hover:bg-zinc-700 transition">Annuler</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {editing && (
        <ModalPortal onClose={() => setEditing(null)}>
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6 border border-zinc-700">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Modifier le coiffeur</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-5">
              <PhotoUpload photo={editPhotoPreview || editing.photo} onPhotoChange={handleEditPhotoChange} isEditing={true} />
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Nom du coiffeur <span className="text-red-400">*</span></label>
                <input type="text" placeholder="Ex: Jean Dupont" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition-colors" autoFocus />
              </div>
              {validationError && (<div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 p-3 rounded-xl"><AlertCircle className="w-4 h-4" /><span>{validationError}</span></div>)}
              <div className="flex gap-3 pt-4">
                <button onClick={handleEditBarber} disabled={isUploading || !newName.trim()} className="flex-1 bg-white text-black py-3 rounded-xl font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                  {isUploading ? 'Modification en cours...' : 'Modifier'}
                </button>
                <button onClick={() => { setEditing(null); setNewName(''); setNewFile(null); setEditPhotoPreview(null); setValidationError(''); }} className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-semibold hover:bg-zinc-700 transition">Annuler</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}