// src/lib/navigationStack.ts

/**
 * 🔥 Pile de navigation unifiée pour gérer le bouton retour natif.
 *
 * Fonctionnalités :
 * - Une seule pile pour toute l'app (évite les conflits entre composants)
 * - Consomme l'événement `popstate` pour que seul le dernier écran soit fermé
 * - Préserve la position de scroll automatiquement
 * - Évite les boucles infinies dans l'historique
 *
 * Utilisation :
 *   const handle = navStack.push('mon-ecran', () => {
 *     // fermer l'écran
 *     return true;
 *   });
 *   // plus tard :
 *   handle.pop();
 */

type Handler = () => boolean;

interface StackEntry {
  id: string;
  handler: Handler;
  savedScrollY: number;
}

class NavigationStack {
  private stack: StackEntry[] = [];
  private listenerAttached = false;

  // 🔥 Empêche le re-push en boucle après un popstate
  private isPoppingRef = false;

  private handlePopState = (e: PopStateEvent) => {
    // Protection contre les appels multiples
    if (this.isPoppingRef) return;

    const top = this.stack[this.stack.length - 1];

    if (!top) {
      // Rien dans la pile : laisser le navigateur faire son travail
      return;
    }

    // 🔥 Consommer l'événement → empêche les autres handlers
    e.stopImmediatePropagation();

    // 🔥 Restaurer la position de scroll AVANT de fermer
    const scrollY = top.savedScrollY;

    // 🔥 Retirer de la pile AVANT d'appeler le handler
    // (sinon le handler peut re-push)
    this.stack.pop();

    // 🔥 Appeler le handler de fermeture
    const handled = top.handler();

    if (handled) {
      // 🔥 Restaurer la position de scroll (après le re-render)
      if (scrollY > 0) {
        setTimeout(() => {
          window.scrollTo({
            top: scrollY,
            behavior: 'instant' as ScrollBehavior,
          });
        }, 50);
      }

      // 🔥 Re-push pour rester dans l'app si la pile n'est pas vide
      if (this.stack.length > 0) {
        // Ne PAS re-push immédiatement (sinon boucle)
        // On utilise requestAnimationFrame pour laisser React se stabiliser
        requestAnimationFrame(() => {
          window.history.pushState({ __nav: true }, '');
        });
      }
    }
  };

  private ensureListener() {
    if (this.listenerAttached) return;
    if (typeof window === 'undefined') return;

    // 🔥 `capture: true` pour intercepter AVANT les autres handlers
    window.addEventListener('popstate', this.handlePopState, true);
    this.listenerAttached = true;
  }

  /**
   * Empile un écran.
   * @param id identifiant unique
   * @param handler fonction appelée quand l'utilisateur appuie sur retour
   */
  push(id: string, handler: Handler): { pop: () => void } {
    this.ensureListener();

    // Retirer si déjà présent (évite les doublons)
    const idx = this.stack.findIndex(e => e.id === id);
    if (idx !== -1) {
      this.stack.splice(idx, 1);
    }

    // 🔥 Sauvegarder la position de scroll au moment du push
    const savedScrollY = typeof window !== 'undefined' ? window.scrollY : 0;

    this.stack.push({ id, handler, savedScrollY });

    // Push un état dans l'historique
    if (typeof window !== 'undefined') {
      window.history.pushState({ __nav: true, __id: id }, '');
    }

    return {
      pop: () => this.pop(id),
    };
  }

  /**
   * Retire un écran de la pile.
   */
  pop(id: string) {
    const idx = this.stack.findIndex(e => e.id === id);
    if (idx === -1) return;

    this.stack.splice(idx, 1);
  }

  /**
   * Nombre d'écrans dans la pile.
   */
  size() {
    return this.stack.length;
  }

  /**
   * L'écran est-il dans la pile ?
   */
  has(id: string) {
    return this.stack.some(e => e.id === id);
  }

  /**
   * Vide complètement la pile.
   */
  clear() {
    this.stack = [];
  }
}

export const navStack = new NavigationStack();