// Palletways' rebuilt tracking page, as track2.palletways.com/index.php served
// it on 28 November 2026 for a pallet delivered on the 26th. Trimmed to the
// parts the reader looks at; the receiver's name and the vehicle registration
// are changed, and the driver's GPS rows, the map and the depot phone number
// are left out.

const HEADER = `
<section class="card status status--{tone}">
	<div class="status__main">
		<div class="status__icon"><svg class="icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg></div>
		<div class="status__text">
			<p class="status__eyebrow">Palletways Tracking ID <strong>60052045327</strong></p>
			<h1 class="status__title">{title}</h1>
										<p class="status__when">{when}</p>
					</div>
			</div>
	<ol class="progress" aria-label="Status">
					<li class="progress__step is-done">
				<span class="progress__dot" aria-hidden="true"></span>
				<span class="progress__label">Out For Delivery</span>
									<span class="progress__date">19/11</span>
							</li>
	</ol>
</section>`

const TIMELINE = `
<section class="card">
	<h2 class="card__title">Journey</h2>
	<ol class="timeline">
		<li class="timeline__item is-latest">
			<span class="timeline__dot" aria-hidden="true"></span>
			<div class="timeline__body">
				<span class="timeline__title">Delivered</span>
			</div>
			<time class="timeline__time" datetime="2026-11-26T10:12:17+00:00">
				26/11/2026<br>10:12							</time>
		</li>
		<li class="timeline__item">
			<span class="timeline__dot" aria-hidden="true"></span>
			<div class="timeline__body">
				<span class="timeline__title">Out for delivery</span>
			</div>
			<time class="timeline__time" datetime="2026-11-26T08:30:51+00:00">
				26/11/2026<br>08:30							</time>
		</li>
		<li class="timeline__item">
			<span class="timeline__dot" aria-hidden="true"></span>
			<div class="timeline__body">
				<span class="timeline__title">Arrived at the delivering depot</span>
				<span class="timeline__place">SK Distribution</span>							</div>
			<time class="timeline__time" datetime="2026-11-19T05:51:07+00:00">
				19/11/2026<br>05:51							</time>
		</li>
	</ol>
</section>`

const NOTES = `
<details class="card disclosure">
	<summary class="disclosure__summary">Full history</summary>
	<table class="notes">
	<thead>
		<tr>
			<th scope="col">Type</th>
			<th scope="col">Number</th>
			<th scope="col">Barcode</th>
			<th scope="col">Comments</th>
			<th scope="col">Date</th>
			<th scope="col">Time</th>
		</tr>
	</thead>
	<tbody>
		<tr class="">
			<td data-label="Type">POD Photo</td>
			<td data-label="Number">33971</td>
			<td data-label="Barcode" class="mono"></td>
			<td data-label="Comments" class="notes__comment">
				<div class="pod">
					<a class="pod__thumb" href="/show_pod.php?fullsize=true&amp;file=20261126101217_267_60052045327_pod_photo_1.jpg" target="_blank" rel="noopener">
						<img src="/show_pod.php?file=20261126101217_267_60052045327_pod_photo_1.jpg" alt="20261126101217_267_60052045327_pod_photo_1.jpg" width="100" height="100" loading="lazy">
					</a>
				</div>
			</td>
			<td data-label="Date">26/11/2026</td>
			<td data-label="Time">10:12</td>
		</tr>
		<tr class="">
			<td data-label="Type">IMAGE SCANNED</td>
			<td data-label="Number">32971</td>
			<td data-label="Barcode" class="mono"></td>
			<td data-label="Comments" class="notes__comment">
				<div class="pod">
					<a class="pod__thumb" href="/show_pod.php?fullsize=true&amp;file=20261126101217_233_60052045327_sos_pod.tif" target="_blank" rel="noopener">
						<img src="/show_pod.php?file=20261126101217_233_60052045327_sos_pod.tif" alt="20261126101217_233_60052045327_sos_pod.tif" width="100" height="100" loading="lazy">
					</a>
				</div>
			</td>
			<td data-label="Date">26/11/2026</td>
			<td data-label="Time">10:12</td>
		</tr>
		<tr class="notes__row--pod">
			<td data-label="Type">CLEAN POD</td>
			<td data-label="Number">31971</td>
			<td data-label="Barcode" class="mono"></td>
			<td data-label="Comments" class="notes__comment">
				Alan @ 10:12 26/11/2026									</td>
			<td data-label="Date">26/11/2026</td>
			<td data-label="Time">10:12</td>
		</tr>
		<tr class="">
			<td data-label="Type">ETA</td>
			<td data-label="Number">29971</td>
			<td data-label="Barcode" class="mono"></td>
			<td data-label="Comments" class="notes__comment">
				Estimated Delivery Time: 10:17 on 26/11/2026<br>Delivery Window: 09:17 - 11:17									</td>
			<td data-label="Date">26/11/2026</td>
			<td data-label="Time">09:19</td>
		</tr>
		<tr class="notes__row--scan">
			<td data-label="Type">SCAN</td>
			<td data-label="Number">27971</td>
			<td data-label="Barcode" class="mono">B005D2DCE8</td>
			<td data-label="Comments" class="notes__comment">
				Scanned onto vehicle AB12CDE at depot 59 C&amp;D Route-12									</td>
			<td data-label="Date">26/11/2026</td>
			<td data-label="Time">08:30</td>
		</tr>
	</tbody>
	</table>
</details>`

function header(tone: string, title: string, when: string): string {
  return HEADER.replace('{tone}', tone).replace('{title}', title).replace('{when}', when)
}

/** The open page, as anybody with the tracking ID sees it. */
export const CARD_DELIVERED = header('delivered', 'Delivered', '26/11/2026, 10:12					') + TIMELINE

/** The page their postcode form unlocks: who signed, and the full history. */
export const CARD_FULL_DELIVERED = header('delivered', 'Delivered', '26/11/2026, 10:12					 · Signed by Alan')
  + TIMELINE + NOTES

/** A card before delivery. Nobody has seen one on a live pallet yet, so the
 *  heading and the line under it are the test's to choose. */
export function cardMoving(tone: string, title: string, when: string): string {
  return header(tone, title, when)
}
