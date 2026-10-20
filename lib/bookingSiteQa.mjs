import assert from 'node:assert/strict';

// Only opens menus and observes the calendar. Never selects a slot or submits a booking.
export async function verifyBookingMenus(page, menus, {returnUrl, timeout=15000, onCalendar=async()=>{}}={}) {
  const observations=[];
  await page.locator('.menu_header, .v-select, select').filter({visible:true}).first().waitFor({state:'visible',timeout});
  if(await page.locator('.menu_header').count()) {
    for(let i=0;i<menus.length;i++) {
      if(i) await page.goto(returnUrl,{waitUntil:'domcontentloaded',timeout:30000});
      const card=page.locator('.menu_header').filter({hasText:menus[i].name});
      await card.first().waitFor({state:'visible',timeout});
      assert.equal(await card.count(),1,'unique actual menu card: '+menus[i].name);
      await card.click();
      const calendar=page.getByRole('table').filter({hasText:'時間'}).first();
      await calendar.waitFor({state:'visible',timeout});
      assert.ok(await calendar.locator('tr').count()>1,'actual calendar contains time rows');
      await page.getByText(menus[i].name,{exact:true}).waitFor({state:'visible',timeout});
      observations.push({menu:menus[i].name,control:'card',calendar_visible:true});
      await onCalendar(page,i);
    }
  } else {
    const native=page.locator('select').filter({has:page.locator('option').filter({hasText:'【初回体験】'})}).first();
    if(await native.count()) {
      for(const menu of menus) {await native.selectOption({label:menu.name});assert.ok(await native.inputValue());observations.push({menu:menu.name,control:'native_select'});}
    } else {
      await page.locator('.v-select').filter({hasText:/メニュー/}).first().click();
      for(const menu of menus) {await page.getByText(menu.name,{exact:true}).waitFor({state:'visible',timeout});observations.push({menu:menu.name,control:'custom_select'});}
    }
  }
  assert.equal(observations.length,3,'all three real trial menus verified');
  return observations;
}
