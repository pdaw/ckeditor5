/**
 * @license Copyright (c) 2003-2017, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/* globals setTimeout, document */

import ViewRange from 'ckeditor5-engine/src/view/range';
import testUtils from 'ckeditor5-core/tests/_utils/utils';
import ViewSelection from 'ckeditor5-engine/src/view/selection';
import ViewDocument from 'ckeditor5-engine/src/view/document';
import SelectionObserver from 'ckeditor5-engine/src/view/observer/selectionobserver';
import MutationObserver from 'ckeditor5-engine/src/view/observer/mutationobserver';

import log from 'ckeditor5-utils/src/log';

import { parse } from 'ckeditor5-engine/src/dev-utils/view';

testUtils.createSinonSandbox();

describe( 'SelectionObserver', () => {
	let viewDocument, viewRoot, mutationObserver, selectionObserver, domRoot;

	beforeEach( ( done ) => {
		domRoot = document.createElement( 'div' );
		domRoot.innerHTML = `<div contenteditable="true" id="main"></div><div contenteditable="true" id="additional"></div>`;
		document.body.appendChild( domRoot );

		viewDocument = new ViewDocument();
		viewDocument.createRoot( document.getElementById( 'main' ) );

		mutationObserver = viewDocument.getObserver( MutationObserver );
		selectionObserver = viewDocument.getObserver( SelectionObserver );

		viewRoot = viewDocument.getRoot();

		viewRoot.appendChildren( parse(
			'<container:p>xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</container:p>' +
			'<container:p>yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy</container:p>' ) );

		viewDocument.render();

		viewDocument.selection.removeAllRanges();
		document.getSelection().removeAllRanges();

		viewDocument.isFocused = true;

		selectionObserver.enable();

		// Ensure selectionchange will not be fired.
		setTimeout( () => done(), 100 );
	} );

	afterEach( () => {
		domRoot.parentElement.removeChild( domRoot );

		viewDocument.destroy();
	} );

	it( 'should fire selectionChange when it is the only change', ( done ) => {
		viewDocument.on( 'selectionChange', ( evt, data ) => {
			expect( data ).to.have.property( 'domSelection' ).that.equals( document.getSelection() );

			expect( data ).to.have.property( 'oldSelection' ).that.is.instanceof( ViewSelection );
			expect( data.oldSelection.rangeCount ).to.equal( 0 );

			expect( data ).to.have.property( 'newSelection' ).that.is.instanceof( ViewSelection );
			expect( data.newSelection.rangeCount ).to.equal( 1 );

			const newViewRange = data.newSelection.getFirstRange();
			const viewFoo = viewDocument.getRoot().getChild( 0 ).getChild( 0 );

			expect( newViewRange.start.parent ).to.equal( viewFoo );
			expect( newViewRange.start.offset ).to.equal( 2 );
			expect( newViewRange.end.parent ).to.equal( viewFoo );
			expect( newViewRange.end.offset ).to.equal( 2 );

			done();
		} );

		changeDomSelection();
	} );

	it( 'should add only one listener to one document', ( done ) => {
		// Add second roots to ensure that listener is added once.
		viewDocument.createRoot( document.getElementById( 'additional' ), 'additional' );

		viewDocument.on( 'selectionChange', () => {
			done();
		} );

		changeDomSelection();
	} );

	it( 'should not fire selectionChange on render', ( done ) => {
		viewDocument.on( 'selectionChange', () => {
			throw 'selectionChange on render';
		} );

		setTimeout( done, 70 );

		const viewBar = viewDocument.getRoot().getChild( 1 ).getChild( 0 );
		viewDocument.selection.addRange( ViewRange.createFromParentsAndOffsets( viewBar, 1, viewBar, 2 ) );
		viewDocument.render();
	} );

	it( 'should not fired if observer is disabled', ( done ) => {
		viewDocument.getObserver( SelectionObserver ).disable();

		viewDocument.on( 'selectionChange', () => {
			throw 'selectionChange on render';
		} );

		setTimeout( done, 70 );

		changeDomSelection();
	} );

	it( 'should not fired if there is no focus', ( done ) => {
		viewDocument.isFocused = false;

		// changeDomSelection() may focus the editable element (happens on Chrome)
		// so cancel this because it sets the isFocused flag.
		viewDocument.on( 'focus', ( evt ) => evt.stop(), { priority: 'highest' } );

		viewDocument.on( 'selectionChange', () => {
			// Validate the correctness of the test. May help tracking issue with this test.
			expect( viewDocument.isFocused ).to.be.false;

			throw 'selectionChange on render';
		} );

		setTimeout( done, 70 );

		changeDomSelection();
	} );

	it( 'should warn and not enter infinite loop', ( done ) => {
		// Reset infinite loop counters so other tests won't mess up with this test.
		selectionObserver._clearInfiniteLoop();

		let counter = 100;

		const viewFoo = viewDocument.getRoot().getChild( 0 ).getChild( 0 );
		viewDocument.selection.addRange( ViewRange.createFromParentsAndOffsets( viewFoo, 0, viewFoo, 0 ) );

		viewDocument.on( 'selectionChange', () => {
			counter--;

			if ( counter > 0 ) {
				setTimeout( changeDomSelection );
			} else {
				throw 'Infinite loop!';
			}
		} );

		let warnedOnce = false;

		testUtils.sinon.stub( log, 'warn', ( msg ) => {
			if ( !warnedOnce ) {
				warnedOnce = true;

				setTimeout( () => {
					expect( msg ).to.match( /^selectionchange-infinite-loop/ );
					done();
				}, 200 );
			}
		} );

		changeDomSelection();
	} );

	it( 'should not be treated as an infinite loop if selection is changed only few times', ( done ) => {
		const viewFoo = viewDocument.getRoot().getChild( 0 ).getChild( 0 );

		// Reset infinite loop counters so other tests won't mess up with this test.
		selectionObserver._clearInfiniteLoop();

		viewDocument.selection.addRange( ViewRange.createFromParentsAndOffsets( viewFoo, 0, viewFoo, 0 ) );

		const spy = testUtils.sinon.spy( log, 'warn' );

		for ( let i = 0; i < 10; i++ ) {
			changeDomSelection();
		}

		setTimeout( () => {
			expect( spy.called ).to.be.false;
			done();
		}, 400 );
	} );

	it( 'should not be treated as an infinite loop if changes are not often', ( done ) => {
		const clock = testUtils.sinon.useFakeTimers( 'setInterval', 'clearInterval' );
		const spy = testUtils.sinon.spy( log, 'warn' );

		// We need to recreate SelectionObserver, so it will use mocked setInterval.
		selectionObserver.disable();
		selectionObserver.destroy();
		viewDocument._observers.delete( SelectionObserver );
		viewDocument.addObserver( SelectionObserver );

		// Inf-loop kicks in after 50th time the selection is changed in 2s.
		// We will test 30 times, tick sinon clock to clean counter and then test 30 times again.
		// Note that `changeDomSelection` fires two events.
		let changeCount = 15;

		for ( let i = 0; i < changeCount; i++ ) {
			setTimeout( () => {
				changeDomSelection();
			}, i * 20 );
		}

		setTimeout( () => {
			// Move the clock by 2100ms which will trigger callback added to `setInterval` and reset the inf-loop counter.
			clock.tick( 2100 );

			for ( let i = 0; i < changeCount; i++ ) {
				changeDomSelection();
			}

			setTimeout( () => {
				expect( spy.called ).to.be.false;
				clock.restore();
				done();
			}, 200 );
		}, 400 );
	} );
} );

function changeDomSelection() {
	const domSelection = document.getSelection();
	const domFoo = document.getElementById( 'main' ).childNodes[ 0 ].childNodes[ 0 ];
	const offset = domSelection.anchorOffset;

	domSelection.removeAllRanges();
	domSelection.collapse( domFoo, offset == 2 ? 3 : 2 );
}
